// ESM/CJS interop. In Node, @coral-xyz/anchor resolves to CommonJS and the ESM
// loader can't see all named exports (e.g. BN), so we read them off `default`.
// In the browser it resolves to a real ESM build with no default export.
import * as anchorNs from "@coral-xyz/anchor";
import type * as A from "@coral-xyz/anchor";

const anchor = ((anchorNs as unknown as { default?: typeof A }).default ?? anchorNs) as typeof A;

export const BN = anchor.BN;
export type BN = A.BN;
export const Program = anchor.Program;
export type Program<T extends A.Idl> = A.Program<T>;
export const AnchorProvider = anchor.AnchorProvider;
export type AnchorProvider = A.AnchorProvider;
export const Wallet = anchor.Wallet;
export type Wallet = A.Wallet;
export const EventParser = anchor.EventParser;
export const BorshCoder = anchor.BorshCoder;
