/**
 * Earn-vault allocator.
 *
 * Policy:
 *  - keep IDLE_TARGET of AUM idle so withdrawals don't need a divest,
 *  - if idle > target: invest the excess into the allocated reserve with the
 *    highest supply APR that has cap room and utilisation below MAX_UTIL,
 *  - if idle < target/2: divest from the lowest-APR reserve to rebuild the buffer.
 */
import { PublicKey } from "@solana/web3.js";
import { client, log, refreshAllReserves, reserveName, vault } from "./common.js";

const POLL_MS = Number(process.env.POLL_MS ?? 15000);
const ONCE = process.argv.includes("--once");
const IDLE_TARGET = 0.1;
const MAX_UTIL = 0.95;

async function tick() {
  await refreshAllReserves();
  const v = await client.fetchVault(vault);
  const view = await client.vaultAum(vault);
  const decimals = (await client.reserveView(view.allocations[0].reserve)).decimals;
  const scale = 10 ** decimals;

  for (const a of view.allocations) {
    log("alloc", `${reserveName(a.reserve).padEnd(8)} $${a.value.toFixed(0).padStart(10)} / cap $${a.cap.toFixed(0)}  supplyAPR ${(a.supplyApr * 100).toFixed(2)}%`);
  }
  log("alloc", `AUM $${view.aum.toFixed(0)}  idle $${view.idle.toFixed(0)}  share price ${view.sharePrice.toFixed(6)}`);

  const target = view.aum * IDLE_TARGET;
  const ranked = await Promise.all(view.allocations.map(async (a) => ({ ...a, rv: await client.reserveView(a.reserve) })));

  if (view.idle > target * 1.2) {
    const best = ranked
      .filter((a) => a.cap > a.value + 1 && a.rv.utilization < MAX_UTIL)
      .sort((x, y) => y.supplyApr - x.supplyApr)[0];
    if (!best) return log("alloc", "idle above target but no allocation has room");
    const amount = Math.min(view.idle - target, best.cap - best.value);
    await client.vaultInvest(vault, best.reserve, BigInt(Math.floor(amount * scale)));
    log("alloc", `✔ invested $${amount.toFixed(0)} into ${reserveName(best.reserve)}`);
  } else if (view.idle < target / 2) {
    const worst = ranked.filter((a) => a.value > 1).sort((x, y) => x.supplyApr - y.supplyApr)[0];
    if (!worst) return;
    const need = Math.min(target - view.idle, worst.rv.available * 0.9, worst.value);
    const slot = v.allocations.find((x) => x.reserve.equals(worst.reserve))!;
    const ktokens = (BigInt(slot.ktokens.toString()) * BigInt(Math.floor((need / worst.value) * 1e6))) / 1_000_000n;
    await client.vaultDivest(vault, worst.reserve, ktokens);
    log("alloc", `✔ divested ~$${need.toFixed(0)} from ${reserveName(worst.reserve)} to rebuild idle buffer`);
  } else {
    log("alloc", "within policy, nothing to do");
  }
}

log("alloc", `allocator for vault ${vault.toBase58()}`);
await tick();
if (!ONCE) setInterval(() => tick().catch((e) => log("alloc", `tick error: ${e}`)), POLL_MS);
void PublicKey;
