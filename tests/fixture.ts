import { AnchorProvider, Wallet } from "../sdk/anchor.js";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { KestrelClient } from "../sdk/index.js";

export const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
export const connection = new Connection(RPC, "confirmed");

export function loadKeypair(path = `${homedir()}/.config/solana/id.json`) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

export function clientFor(kp: Keypair) {
  const provider = new AnchorProvider(connection, new Wallet(kp), { commitment: "confirmed", skipPreflight: false });
  return new KestrelClient(provider);
}

export async function fund(kp: PublicKey, sol = 10) {
  const sig = await connection.requestAirdrop(kp, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

export async function newActor(sol = 10) {
  const kp = Keypair.generate();
  await fund(kp.publicKey, sol);
  return { kp, client: clientFor(kp) };
}

export async function newMint(payer: Keypair, decimals: number) {
  return createMint(connection, payer, payer.publicKey, null, decimals);
}

export async function mintToOwner(payer: Keypair, mint: PublicKey, owner: PublicKey, amount: bigint) {
  const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, owner);
  await mintTo(connection, payer, mint, ata.address, payer, amount);
  return ata.address;
}

export async function balance(ata: PublicKey): Promise<bigint> {
  const info = await connection.getAccountInfo(ata);
  if (!info) return 0n;
  return BigInt((await connection.getTokenAccountBalance(ata)).value.amount);
}

/** Expect a promise to reject with an Anchor error whose name contains `code`. */
export async function expectError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    const msg = String((e as Error).message) + JSON.stringify((e as { logs?: string[] }).logs ?? []);
    if (msg.includes(code)) return;
    throw new Error(`expected ${code}, got: ${msg.slice(0, 400)}`);
  }
  throw new Error(`expected ${code}, but call succeeded`);
}
