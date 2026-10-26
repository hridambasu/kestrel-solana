/**
 * Bootstraps a demo market on localnet and writes deployments/localnet.json.
 *
 *   npm run localnet      # terminal 1
 *   npm run seed          # terminal 2
 *
 * Creates: USDC / jitoSOL / tBILL mints + mock feeds, a market with an eMode
 * group for stables+T-bills, three reserves, a curated USDC vault, and borrowers
 * at different health levels so the keeper and dashboard have something to show.
 */
import { writeFileSync } from "node:fs";
import { pda, defaultReserveConfig } from "../sdk/index.js";
import { fund, loadKeypair, clientFor, mintToOwner, newActor, newMint } from "../tests/fixture.js";

const USDC = 10n ** 6n;
const SOL9 = 10n ** 9n;

const admin = loadKeypair();
await fund(admin.publicKey, 100);
const A = clientFor(admin);

const usdcMint = await newMint(admin, 6);
const lstMint = await newMint(admin, 9);
const tbillMint = await newMint(admin, 6);
const usdcFeed = await A.initMockPrice(1.0);
const lstFeed = await A.initMockPrice(150.0);
const tbillFeed = await A.initMockPrice(1.05);

const market = await A.initMarket();
await A.setElevationGroup(market, { id: 1, ltvBps: 9200, liquidationThresholdBps: 9500, liquidationBonusBps: 200 });

const usdcReserve = await A.initReserve(market, usdcMint, usdcFeed, defaultReserveConfig({
  ltvBps: 8000, liquidationThresholdBps: 8500, liquidationBonusBps: 400, elevationGroup: 1,
  optimalUtilBps: 9000, optimalRateBps: 900, maxRateBps: 6000,
}));
const lstReserve = await A.initReserve(market, lstMint, lstFeed, defaultReserveConfig({
  ltvBps: 7000, liquidationThresholdBps: 7800, liquidationBonusBps: 700, borrowFactorBps: 12_500,
  optimalUtilBps: 4500, optimalRateBps: 600, maxRateBps: 20_000,
}));
const tbillReserve = await A.initReserve(market, tbillMint, tbillFeed, defaultReserveConfig({
  ltvBps: 8500, liquidationThresholdBps: 9000, liquidationBonusBps: 300, permissioned: true, borrowEnabled: false, elevationGroup: 1,
}));
console.log("market", market.toBase58());

// Liquidity: a direct supplier plus the curated vault
const supplier = await newActor();
await mintToOwner(admin, usdcMint, supplier.kp.publicKey, 2_000_000n * USDC);
await supplier.client.supply(market, usdcReserve, 1_500_000n * USDC);

const lp = await newActor();
await mintToOwner(admin, lstMint, lp.kp.publicKey, 5_000n * SOL9);
await lp.client.supply(market, lstReserve, 5_000n * SOL9);

// Vault PDA is (curator, name): derive the name from the market so re-seeding never collides.
const vault = await A.initVault(`usdc-prime-${market.toBase58().slice(0, 6)}`, usdcMint, 1000);
await A.setAllocation(vault, usdcReserve, 1_000_000n * USDC);
await mintToOwner(admin, usdcMint, admin.publicKey, 1_200_000n * USDC);
await A.vaultDeposit(vault, 1_200_000n * USDC);
await A.vaultInvest(vault, usdcReserve, 900_000n * USDC);

// Borrowers
const safe = await newActor();
await mintToOwner(admin, lstMint, safe.kp.publicKey, 2_000n * SOL9);
await safe.client.initObligation(market);
await safe.client.depositCollateral(market, lstReserve, 2_000n * SOL9); // $300k
await safe.client.borrow(market, usdcReserve, 120_000n * USDC);

const risky = await newActor();
await mintToOwner(admin, lstMint, risky.kp.publicKey, 1_000n * SOL9);
await risky.client.initObligation(market);
await risky.client.depositCollateral(market, lstReserve, 1_000n * SOL9); // $150k, liq at $117k
await risky.client.borrow(market, usdcReserve, 104_000n * USDC); // HF ~1.125

const rwa = await newActor();
await mintToOwner(admin, tbillMint, rwa.kp.publicKey, 500_000n * USDC);
await A.issueCredential(market, rwa.kp.publicKey, Math.floor(Date.now() / 1000) + 365 * 86400);
await rwa.client.initObligation(market, 1);
await rwa.client.depositCollateral(market, tbillReserve, 500_000n * USDC); // $525k
await rwa.client.borrow(market, usdcReserve, 450_000n * USDC); // eMode 92% LTV

const looper = await newActor();
await mintToOwner(admin, usdcMint, looper.kp.publicKey, 200_000n * USDC);
await looper.client.initObligation(market);
await looper.client.depositCollateral(market, usdcReserve, 200_000n * USDC);
await looper.client.borrow(market, lstReserve, 600n * SOL9); // short SOL: $90k * 1.25 bf

// Keeper inventory: the liquidator repays debt from its own balance.
await mintToOwner(admin, usdcMint, admin.publicKey, 500_000n * USDC);
await mintToOwner(admin, lstMint, admin.publicKey, 1_000n * SOL9);

const out = {
  rpc: "http://127.0.0.1:8899",
  programId: A.program.programId.toBase58(),
  market: market.toBase58(),
  vault: vault.toBase58(),
  reserves: {
    USDC: { address: usdcReserve.toBase58(), mint: usdcMint.toBase58(), feed: usdcFeed.toBase58(), decimals: 6 },
    jitoSOL: { address: lstReserve.toBase58(), mint: lstMint.toBase58(), feed: lstFeed.toBase58(), decimals: 9 },
    tBILL: { address: tbillReserve.toBase58(), mint: tbillMint.toBase58(), feed: tbillFeed.toBase58(), decimals: 6 },
  },
  obligations: {
    safe: pda.obligation(market, safe.kp.publicKey).toBase58(),
    risky: pda.obligation(market, risky.kp.publicKey).toBase58(),
    rwa: pda.obligation(market, rwa.kp.publicKey).toBase58(),
    looper: pda.obligation(market, looper.kp.publicKey).toBase58(),
  },
};
writeFileSync(new URL("../deployments/localnet.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("wrote deployments/localnet.json");
