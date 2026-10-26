import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import { clientFor, loadKeypair } from "../tests/fixture.js";

export type Deployment = {
  rpc: string;
  programId: string;
  market: string;
  vault: string;
  reserves: Record<string, { address: string; mint: string; feed: string; decimals: number }>;
  obligations: Record<string, string>;
};

export const deployment: Deployment = JSON.parse(
  readFileSync(process.env.DEPLOYMENT ?? new URL("../deployments/localnet.json", import.meta.url), "utf8"),
);
export const market = new PublicKey(deployment.market);
export const vault = new PublicKey(deployment.vault);

/** Keeper signer. Defaults to the local CLI wallet (also the demo admin). */
export const keeperKeypair = loadKeypair(process.env.KEEPER_KEYPAIR);
export const client = clientFor(keeperKeypair);

export const reserveName = (k: PublicKey) =>
  Object.entries(deployment.reserves).find(([, r]) => r.address === k.toBase58())?.[0] ?? k.toBase58().slice(0, 6);

export const log = (scope: string, msg: string) => console.log(`${new Date().toISOString()} [${scope}] ${msg}`);

/** One transaction that refreshes every reserve in the market (accrues interest, pulls prices). */
export async function refreshAllReserves() {
  const ixs = await Promise.all(Object.values(deployment.reserves).map((r) => client.refreshReserveIx(new PublicKey(r.address), new PublicKey(r.feed))));
  await client.send(ixs);
}
