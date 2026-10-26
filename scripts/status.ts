/** One-shot snapshot of reserves, obligations and the vault. */
import { PublicKey } from "@solana/web3.js";
import { computeHealth } from "../sdk/health.js";
import { client, deployment, market, refreshAllReserves, reserveName, vault } from "../keeper/common.js";

await refreshAllReserves();
const views = await Promise.all(Object.values(deployment.reserves).map((r) => client.reserveView(new PublicKey(r.address))));
console.table(
  views.map((r) => ({
    reserve: reserveName(r.address),
    price: r.price.toFixed(2),
    supplied: r.totalSupply.toFixed(0),
    borrowed: r.borrowed.toFixed(0),
    util: `${(r.utilization * 100).toFixed(1)}%`,
    borrowAPR: `${(r.borrowApr * 100).toFixed(2)}%`,
    supplyAPR: `${(r.supplyApr * 100).toFixed(2)}%`,
    rwa: r.config.permissioned ? "yes" : "",
  })),
);

const [m, reserves, obligations] = await Promise.all([
  client.fetchMarket(market),
  client.program.account.reserve.all([{ memcmp: { offset: 8, bytes: market.toBase58() } }]),
  client.program.account.obligation.all([{ memcmp: { offset: 8, bytes: market.toBase58() } }]),
]);
const byKey = new Map(reserves.map((r) => [r.publicKey.toBase58(), r.account]));
console.table(
  obligations
    .map(({ publicKey, account }) => ({ publicKey, account, h: computeHealth(account, byKey, m) }))
    .filter((x) => x.h.debtValue > 0)
    .sort((a, b) => a.h.healthFactor - b.h.healthFactor)
    .map(({ publicKey, account, h }) => ({
      obligation: publicKey.toBase58().slice(0, 8),
      eMode: account.elevationGroup || "",
      collateral: h.collateralValue.toFixed(0),
      debt: h.debtValue.toFixed(0),
      HF: h.healthFactor.toFixed(3),
    })),
);

const v = await client.vaultAum(vault);
console.log(`Vault AUM $${v.aum.toFixed(0)} | idle $${v.idle.toFixed(0)} | share price ${v.sharePrice.toFixed(6)}`);
