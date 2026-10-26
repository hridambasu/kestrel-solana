/**
 * Kestrel liquidation keeper.
 *
 * Each tick:
 *  1. refresh all reserves in one tx (fresh prices + interest),
 *  2. fetch every obligation in the market with a single getProgramAccounts
 *     (memcmp on the market field) and score health off-chain (sdk/health.ts),
 *  3. for each HF < 1: liquidate the largest borrow against the largest deposit
 *     (refresh bundle + liquidate in one tx), then redeem seized kTokens to the
 *     underlying so inventory stays liquid.
 *
 * The keeper needs inventory in the debt asset (no flash loans on this program).
 * On mainnet you'd wrap this in a flash loan and swap the seized collateral via
 * Jupiter in the same transaction; RWA collateral needs a credentialed keeper.
 */
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { computeHealth } from "../sdk/health.js";
import { client, keeperKeypair, log, market, refreshAllReserves, reserveName } from "./common.js";

const POLL_MS = Number(process.env.POLL_MS ?? 5000);
const ONCE = process.argv.includes("--once");
const MAX_REPAY = BigInt(process.env.MAX_REPAY ?? "18446744073709551615");

async function tick() {
  await refreshAllReserves();

  const [m, reserves, obligations] = await Promise.all([
    client.fetchMarket(market),
    client.program.account.reserve.all([{ memcmp: { offset: 8, bytes: market.toBase58() } }]),
    client.program.account.obligation.all([{ memcmp: { offset: 8, bytes: market.toBase58() } }]),
  ]);
  const byKey = new Map(reserves.map((r) => [r.publicKey.toBase58(), r.account]));

  let unhealthy = 0;
  for (const { publicKey, account } of obligations) {
    const h = computeHealth(account, byKey, m);
    if (h.debtValue === 0 || h.healthFactor >= 1) continue;
    unhealthy++;
    if (!h.largestBorrow || !h.largestDeposit) continue;

    const repay = h.largestBorrow.reserve;
    const seize = h.largestDeposit.reserve;
    log("liq", `${publicKey.toBase58().slice(0, 8)} HF=${h.healthFactor.toFixed(4)} debt=$${h.debtValue.toFixed(0)} -> repay ${reserveName(repay)}, seize ${reserveName(seize)}`);
    try {
      const sig = await client.liquidate(market, publicKey, repay, seize, MAX_REPAY);
      const seizeReserve = byKey.get(seize.toBase58())!;
      const kAta = getAssociatedTokenAddressSync(
        (await client.fetchReserve(seize)).collateralMint,
        keeperKeypair.publicKey,
      );
      const k = await client.ktokenBalance(kAta);
      if (k > 0n) await client.redeem(market, seize, k).catch((e) => log("liq", `redeem deferred: ${String(e).slice(0, 80)}`));
      log("liq", `✔ liquidated ${publicKey.toBase58().slice(0, 8)} (${sig.slice(0, 16)}…), redeemed ${Number(k) / 10 ** seizeReserve.decimals} ${reserveName(seize)}`);
    } catch (e) {
      const logs: string[] = (e as { logs?: string[] }).logs ?? [];
      const reason = logs.find((l) => l.includes("Error Message")) ?? String((e as Error).message).split("\n")[0];
      log("liq", `✘ ${publicKey.toBase58().slice(0, 8)}: ${reason.slice(0, 160)}`);
    }
  }
  log("liq", `scanned ${obligations.length} obligations, ${unhealthy} liquidatable`);
}

log("liq", `keeper ${keeperKeypair.publicKey.toBase58()} on market ${market.toBase58()}`);
await tick();
if (!ONCE) setInterval(() => tick().catch((e) => log("liq", `tick error: ${e}`)), POLL_MS);
void PublicKey;
