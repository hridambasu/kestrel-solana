/**
 * Off-chain mirror of `Obligation::refresh`. Lets keepers and UIs scan every
 * obligation cheaply from fetched accounts (after one tx that refreshes the
 * reserves) instead of sending a refresh bundle per obligation.
 */
import { PublicKey } from "@solana/web3.js";

type Num = { toString(): string };
type ReserveAcc = {
  decimals: number;
  availableAmount: Num;
  borrowedAmountWads: Num;
  accumulatedProtocolFeesWads: Num;
  collateralMintSupply: Num;
  cumulativeBorrowRateWads: Num;
  priceLowerWads: Num;
  priceUpperWads: Num;
  config: { ltvBps: number; liquidationThresholdBps: number; borrowFactorBps: number; liquidationBonusBps: number };
};
type ObligationAcc = {
  elevationGroup: number;
  deposits: { reserve: PublicKey; depositedAmount: Num }[];
  borrows: { reserve: PublicKey; borrowedAmountWads: Num; cumulativeBorrowRateWads: Num }[];
};
type MarketAcc = { elevationGroups: { id: number; ltvBps: number; liquidationThresholdBps: number }[] };

const f = (x: Num, scale = 1e18) => Number(BigInt(x.toString())) / scale;
const EMPTY = PublicKey.default.toBase58();

export type Health = {
  collateralValue: number;
  debtValue: number; // borrow-factor adjusted
  liquidationThreshold: number; // USD debt at which HF = 1
  healthFactor: number;
  largestDeposit?: { reserve: PublicKey; value: number };
  largestBorrow?: { reserve: PublicKey; value: number; amount: number };
};

export function computeHealth(o: ObligationAcc, reserves: Map<string, ReserveAcc>, market: MarketAcc): Health {
  const group = o.elevationGroup ? market.elevationGroups.find((g) => g.id === o.elevationGroup) : undefined;
  let collateralValue = 0;
  let threshold = 0;
  let debtValue = 0;
  let largestDeposit: Health["largestDeposit"];
  let largestBorrow: Health["largestBorrow"];

  for (const d of o.deposits.filter((d) => d.reserve.toBase58() !== EMPTY)) {
    const r = reserves.get(d.reserve.toBase58());
    if (!r) continue;
    const scale = 10 ** r.decimals;
    const total = f(r.availableAmount, 1) + f(r.borrowedAmountWads) - f(r.accumulatedProtocolFeesWads);
    const supply = f(r.collateralMintSupply, 1);
    const liquidity = supply > 0 ? (f(d.depositedAmount, 1) * total) / supply : 0;
    const value = (liquidity / scale) * f(r.priceLowerWads);
    collateralValue += value;
    threshold += value * ((group?.liquidationThresholdBps ?? r.config.liquidationThresholdBps) / 1e4);
    if (!largestDeposit || value > largestDeposit.value) largestDeposit = { reserve: d.reserve, value };
  }

  for (const b of o.borrows.filter((b) => b.reserve.toBase58() !== EMPTY)) {
    const r = reserves.get(b.reserve.toBase58());
    if (!r) continue;
    const growth = f(r.cumulativeBorrowRateWads) / f(b.cumulativeBorrowRateWads);
    const amount = (f(b.borrowedAmountWads) * growth) / 10 ** r.decimals;
    const value = amount * f(r.priceUpperWads);
    debtValue += value * (group ? 1 : r.config.borrowFactorBps / 1e4);
    if (!largestBorrow || value > largestBorrow.value) largestBorrow = { reserve: b.reserve, value, amount };
  }

  return {
    collateralValue,
    debtValue,
    liquidationThreshold: threshold,
    healthFactor: debtValue === 0 ? Infinity : threshold / debtValue,
    largestDeposit,
    largestBorrow,
  };
}
