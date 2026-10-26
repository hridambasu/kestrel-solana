import { Connection, Keypair, PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { AnchorProvider } from "../../sdk/anchor";
import { KestrelClient } from "../../sdk/index";
import { computeHealth } from "../../sdk/health";
import deployment from "../../deployments/localnet.json";

export { deployment };

// Read-only: a throwaway wallet satisfies AnchorProvider; nothing is ever signed.
const readOnlyWallet = {
  publicKey: Keypair.generate().publicKey,
  signTransaction: async <T extends Transaction | VersionedTransaction>(t: T) => t,
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(t: T[]) => t,
};
const connection = new Connection((import.meta.env.VITE_RPC_URL as string | undefined) ?? deployment.rpc, "confirmed");
const client = new KestrelClient(new AnchorProvider(connection, readOnlyWallet as never, { commitment: "confirmed" }));
const market = new PublicKey(deployment.market);

export type ReserveRow = {
  name: string;
  address: string;
  price: number;
  supplied: number;
  borrowed: number;
  utilization: number;
  borrowApr: number;
  supplyApr: number;
  ltv: number;
  liquidationThreshold: number;
  borrowFactor: number;
  permissioned: boolean;
  borrowEnabled: boolean;
  eMode: number;
  updatedAgo: number;
};

export type ObligationRow = {
  address: string;
  label: string;
  eMode: number;
  collateral: number;
  debt: number;
  healthFactor: number;
  collateralAssets: string[];
  debtAssets: string[];
};

export type Snapshot = {
  slot: number;
  reserves: ReserveRow[];
  obligations: ObligationRow[];
  vault: { aum: number; idle: number; sharePrice: number; allocations: { name: string; value: number; cap: number; supplyApr: number }[] };
  eModeGroups: { id: number; ltv: number; threshold: number }[];
};

const nameOf = (k: PublicKey | string) => {
  const key = typeof k === "string" ? k : k.toBase58();
  return Object.entries(deployment.reserves).find(([, r]) => r.address === key)?.[0] ?? key.slice(0, 4);
};
const labels = Object.fromEntries(Object.entries(deployment.obligations).map(([k, v]) => [v, k]));

export async function loadSnapshot(): Promise<Snapshot> {
  const [slot, m, reserves, obligations] = await Promise.all([
    connection.getSlot(),
    client.fetchMarket(market),
    client.program.account.reserve.all([{ memcmp: { offset: 8, bytes: market.toBase58() } }]),
    client.program.account.obligation.all([{ memcmp: { offset: 8, bytes: market.toBase58() } }]),
  ]);
  const now = Date.now() / 1000;
  const byKey = new Map(reserves.map((r) => [r.publicKey.toBase58(), r.account]));

  const reserveRows: ReserveRow[] = await Promise.all(
    Object.values(deployment.reserves).map(async (d) => {
      const v = await client.reserveView(new PublicKey(d.address));
      const raw = byKey.get(d.address)!;
      return {
        name: nameOf(d.address),
        address: d.address,
        price: v.price,
        supplied: v.totalSupply * v.price,
        borrowed: v.borrowed * v.price,
        utilization: v.utilization,
        borrowApr: v.borrowApr,
        supplyApr: v.supplyApr,
        ltv: v.config.ltvBps / 1e4,
        liquidationThreshold: v.config.liquidationThresholdBps / 1e4,
        borrowFactor: v.config.borrowFactorBps / 1e4,
        permissioned: v.config.permissioned,
        borrowEnabled: v.config.borrowEnabled,
        eMode: v.config.elevationGroup,
        updatedAgo: Math.max(0, now - Number(raw.lastUpdateTs.toString())),
      };
    }),
  );

  const obligationRows: ObligationRow[] = obligations
    .map(({ publicKey, account }) => {
      const h = computeHealth(account, byKey, m);
      const empty = PublicKey.default.toBase58();
      return {
        address: publicKey.toBase58(),
        label: labels[publicKey.toBase58()] ?? publicKey.toBase58().slice(0, 6),
        eMode: account.elevationGroup,
        collateral: h.collateralValue,
        debt: h.debtValue,
        healthFactor: h.healthFactor,
        collateralAssets: account.deposits.filter((d) => d.reserve.toBase58() !== empty).map((d) => nameOf(d.reserve)),
        debtAssets: account.borrows.filter((b) => b.reserve.toBase58() !== empty).map((b) => nameOf(b.reserve)),
      };
    })
    .filter((o) => o.debt > 0.01)
    .sort((a, b) => a.healthFactor - b.healthFactor);

  const v = await client.vaultAum(new PublicKey(deployment.vault));

  return {
    slot,
    reserves: reserveRows,
    obligations: obligationRows,
    vault: {
      aum: v.aum,
      idle: v.idle,
      sharePrice: v.sharePrice,
      allocations: v.allocations.map((a) => ({ name: nameOf(a.reserve), value: a.value, cap: a.cap, supplyApr: a.supplyApr })),
    },
    eModeGroups: m.elevationGroups
      .filter((g) => g.id !== 0)
      .map((g) => ({ id: g.id, ltv: g.ltvBps / 1e4, threshold: g.liquidationThresholdBps / 1e4 })),
  };
}
