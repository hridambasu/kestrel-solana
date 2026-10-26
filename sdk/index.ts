/**
 * Kestrel TypeScript SDK.
 *
 * Wraps the Anchor client with:
 *  - PDA derivation,
 *  - automatic "refresh bundles": every health-sensitive instruction is sent in
 *    one transaction preceded by `refresh_reserve` for each reserve the obligation
 *    touches and a `refresh_obligation`, matching the on-chain freshness rules,
 *  - read helpers that turn raw accounts into APRs, utilisation and health.
 */
import { AnchorProvider, BN, Program } from "./anchor.js";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type Signer,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import IDL from "./idl.json" with { type: "json" };
import type { Kestrel } from "./kestrel.js";

export const PROGRAM_ID = new PublicKey(IDL.address);
export const WAD = 10n ** 18n;
const enc = (s: string) => Buffer.from(s);

/* ----------------------------------- PDAs ---------------------------------- */

export const pda = {
  authority: (market: PublicKey) => PublicKey.findProgramAddressSync([enc("authority"), market.toBuffer()], PROGRAM_ID)[0],
  reserve: (market: PublicKey, mint: PublicKey) =>
    PublicKey.findProgramAddressSync([enc("reserve"), market.toBuffer(), mint.toBuffer()], PROGRAM_ID)[0],
  liquidityVault: (reserve: PublicKey) => PublicKey.findProgramAddressSync([enc("liquidity"), reserve.toBuffer()], PROGRAM_ID)[0],
  collateralMint: (reserve: PublicKey) => PublicKey.findProgramAddressSync([enc("kmint"), reserve.toBuffer()], PROGRAM_ID)[0],
  collateralVault: (reserve: PublicKey) => PublicKey.findProgramAddressSync([enc("kvault"), reserve.toBuffer()], PROGRAM_ID)[0],
  obligation: (market: PublicKey, owner: PublicKey) =>
    PublicKey.findProgramAddressSync([enc("obligation"), market.toBuffer(), owner.toBuffer()], PROGRAM_ID)[0],
  credential: (market: PublicKey, holder: PublicKey) =>
    PublicKey.findProgramAddressSync([enc("credential"), market.toBuffer(), holder.toBuffer()], PROGRAM_ID)[0],
  vault: (curator: PublicKey, name: string) =>
    PublicKey.findProgramAddressSync([enc("earn_vault"), curator.toBuffer(), enc(name)], PROGRAM_ID)[0],
  vaultIdle: (vault: PublicKey) => PublicKey.findProgramAddressSync([enc("idle"), vault.toBuffer()], PROGRAM_ID)[0],
  vaultShares: (vault: PublicKey) => PublicKey.findProgramAddressSync([enc("shares"), vault.toBuffer()], PROGRAM_ID)[0],
  vaultKTokens: (vault: PublicKey, reserve: PublicKey) =>
    PublicKey.findProgramAddressSync([enc("vault_k"), vault.toBuffer(), reserve.toBuffer()], PROGRAM_ID)[0],
};

/* ---------------------------------- types ---------------------------------- */

export type ReserveConfig = {
  ltvBps: number;
  liquidationThresholdBps: number;
  liquidationBonusBps: number;
  borrowFactorBps: number;
  protocolFeeBps: number;
  minRateBps: number;
  optimalUtilBps: number;
  optimalRateBps: number;
  maxRateBps: number;
  depositLimit: BN;
  borrowLimit: BN;
  borrowEnabled: boolean;
  permissioned: boolean;
  elevationGroup: number;
  maxPriceAgeS: number;
  maxConfBps: number;
};

export const defaultReserveConfig = (o: Partial<ReserveConfig> = {}): ReserveConfig => ({
  ltvBps: 7500,
  liquidationThresholdBps: 8000,
  liquidationBonusBps: 500,
  borrowFactorBps: 10_000,
  protocolFeeBps: 1000,
  minRateBps: 0,
  optimalUtilBps: 8000,
  optimalRateBps: 800,
  maxRateBps: 15_000,
  depositLimit: new BN("18446744073709551615"),
  borrowLimit: new BN("18446744073709551615"),
  borrowEnabled: true,
  permissioned: false,
  elevationGroup: 0,
  maxPriceAgeS: 120,
  maxConfBps: 200,
  ...o,
});

export type ReserveView = {
  address: PublicKey;
  mint: PublicKey;
  decimals: number;
  oracle: PublicKey;
  available: number;
  borrowed: number;
  totalSupply: number;
  utilization: number;
  borrowApr: number;
  supplyApr: number;
  price: number;
  ktokenRate: number; // liquidity per kToken
  config: ReserveConfig;
};

export type ObligationView = {
  address: PublicKey;
  owner: PublicKey;
  elevationGroup: number;
  depositedValue: number;
  debtValue: number;
  allowedBorrowValue: number;
  unhealthyBorrowValue: number;
  healthFactor: number;
  deposits: { reserve: PublicKey; ktokens: bigint; value: number }[];
  borrows: { reserve: PublicKey; amountWads: bigint; value: number }[];
};

const toNum = (bn: BN | bigint, scale = 1e18) => Number(BigInt(bn.toString())) / scale;

/** Kinked curve, mirrors `math::RateCurve::borrow_rate`. */
export function borrowRate(c: ReserveConfig, util: number): number {
  const u = Math.min(util, 1);
  const opt = c.optimalUtilBps / 1e4;
  if (u <= opt) return c.minRateBps / 1e4 + (opt === 0 ? 0 : (u / opt) * (c.optimalRateBps - c.minRateBps)) / 1e4;
  return (c.optimalRateBps + ((u - opt) / (1 - opt)) * (c.maxRateBps - c.optimalRateBps)) / 1e4;
}

/* ---------------------------------- client --------------------------------- */

export class KestrelClient {
  readonly program: Program<Kestrel>;

  constructor(readonly provider: AnchorProvider) {
    this.program = new Program<Kestrel>(IDL as unknown as Kestrel, provider);
  }

  get wallet() {
    return this.provider.wallet.publicKey;
  }

  /** Send instructions in one tx with a CU bump (refresh bundles are compute-heavy). */
  async send(ixs: TransactionInstruction[], signers: Signer[] = []): Promise<string> {
    const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }), ...ixs);
    return this.provider.sendAndConfirm(tx, signers);
  }

  /* ------------------------------- fetchers ------------------------------- */

  fetchReserve(r: PublicKey) {
    return this.program.account.reserve.fetch(r);
  }
  fetchObligation(o: PublicKey) {
    return this.program.account.obligation.fetch(o);
  }
  fetchMarket(m: PublicKey) {
    return this.program.account.market.fetch(m);
  }
  fetchVault(v: PublicKey) {
    return this.program.account.earnVault.fetch(v);
  }

  async reserveView(address: PublicKey): Promise<ReserveView> {
    const r = await this.fetchReserve(address);
    const scale = 10 ** r.decimals;
    const available = Number(r.availableAmount.toString()) / scale;
    const borrowed = toNum(r.borrowedAmountWads) / scale;
    const fees = toNum(r.accumulatedProtocolFeesWads) / scale;
    const totalSupply = available + borrowed - fees;
    const utilization = totalSupply > 0 ? borrowed / totalSupply : 0;
    const config = r.config as unknown as ReserveConfig;
    const br = borrowRate(config, utilization);
    const ksupply = Number(r.collateralMintSupply.toString()) / scale;
    return {
      address,
      mint: r.liquidityMint,
      decimals: r.decimals,
      oracle: r.oracle,
      available,
      borrowed,
      totalSupply,
      utilization,
      borrowApr: br,
      supplyApr: br * utilization * (1 - config.protocolFeeBps / 1e4),
      price: toNum(r.priceLowerWads),
      ktokenRate: ksupply > 0 ? totalSupply / ksupply : 1,
      config,
    };
  }

  async obligationView(address: PublicKey): Promise<ObligationView> {
    const o = await this.fetchObligation(address);
    const empty = PublicKey.default.toBase58();
    const debt = toNum(o.borrowFactorAdjustedDebtWads);
    const unhealthy = toNum(o.unhealthyBorrowValueWads);
    return {
      address,
      owner: o.owner,
      elevationGroup: o.elevationGroup,
      depositedValue: toNum(o.depositedValueWads),
      debtValue: debt,
      allowedBorrowValue: toNum(o.allowedBorrowValueWads),
      unhealthyBorrowValue: unhealthy,
      healthFactor: debt === 0 ? Infinity : unhealthy / debt,
      deposits: o.deposits
        .filter((d) => d.reserve.toBase58() !== empty)
        .map((d) => ({ reserve: d.reserve, ktokens: BigInt(d.depositedAmount.toString()), value: toNum(d.marketValueWads) })),
      borrows: o.borrows
        .filter((b) => b.reserve.toBase58() !== empty)
        .map((b) => ({ reserve: b.reserve, amountWads: BigInt(b.borrowedAmountWads.toString()), value: toNum(b.marketValueWads) })),
    };
  }

  /* ------------------------------ refresh bundles ------------------------- */

  async refreshReserveIx(reserve: PublicKey, oracle?: PublicKey) {
    const o = oracle ?? (await this.fetchReserve(reserve)).oracle;
    return this.program.methods.refreshReserve().accountsPartial({ reserve, oracle: o }).instruction();
  }

  /**
   * Refresh every reserve an obligation touches (+ extra reserves the next ix
   * needs), then the obligation itself. `extraReserves` covers reserves not yet
   * in the obligation, e.g. the first borrow from a new reserve.
   */
  async refreshBundle(market: PublicKey, obligation: PublicKey, extraReserves: PublicKey[] = []) {
    const o = await this.fetchObligation(obligation);
    const empty = PublicKey.default.toBase58();
    const active = [
      ...o.deposits.filter((d) => d.reserve.toBase58() !== empty).map((d) => d.reserve),
      ...o.borrows.filter((b) => b.reserve.toBase58() !== empty).map((b) => b.reserve),
    ];
    const unique = [...new Map([...active, ...extraReserves].map((k) => [k.toBase58(), k])).values()];
    const ixs = await Promise.all(unique.map((r) => this.refreshReserveIx(r)));
    ixs.push(
      await this.program.methods
        .refreshObligation()
        .accountsPartial({ market, obligation })
        .remainingAccounts(active.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false })))
        .instruction(),
    );
    return ixs;
  }

  /* ---------------------------------- admin ------------------------------- */

  async initMarket(compliance: PublicKey = this.wallet) {
    const market = Keypair.generate();
    await this.program.methods.initMarket(compliance).accounts({ admin: this.wallet, market: market.publicKey }).signers([market]).rpc();
    return market.publicKey;
  }

  async initMockPrice(price: number, expo = -8, confBps = 5) {
    const kp = Keypair.generate();
    const p = new BN(Math.round(price * 10 ** -expo));
    const conf = p.muln(confBps).divn(10_000);
    await this.program.methods.initMockPrice(p, conf, expo, p).accounts({ authority: this.wallet, price: kp.publicKey }).signers([kp]).rpc();
    return kp.publicKey;
  }

  async setMockPrice(feed: PublicKey, price: number, opts: { expo?: number; ema?: number; confBps?: number } = {}) {
    const expo = opts.expo ?? -8;
    const p = new BN(Math.round(price * 10 ** -expo));
    const ema = new BN(Math.round((opts.ema ?? price) * 10 ** -expo));
    const conf = p.muln(opts.confBps ?? 5).divn(10_000);
    return this.program.methods.setMockPrice(p, conf, expo, ema).accountsPartial({ authority: this.wallet, price: feed }).rpc();
  }

  async initReserve(market: PublicKey, mint: PublicKey, oracle: PublicKey, config: ReserveConfig) {
    await this.program.methods
      .initReserve(config as never)
      .accountsPartial({ admin: this.wallet, market, liquidityMint: mint, oracle })
      .rpc();
    return pda.reserve(market, mint);
  }

  setElevationGroup(market: PublicKey, g: { id: number; ltvBps: number; liquidationThresholdBps: number; liquidationBonusBps: number }) {
    return this.program.methods
      .updateMarket({ paused: null, closeFactorBps: null, complianceAuthority: null, elevationGroup: g })
      .accountsPartial({ admin: this.wallet, market })
      .rpc();
  }

  issueCredential(market: PublicKey, holder: PublicKey, expiresAt: number) {
    return this.program.methods
      .issueCredential(holder, new BN(expiresAt))
      .accountsPartial({ complianceAuthority: this.wallet, market, credential: pda.credential(market, holder) })
      .rpc();
  }

  /* --------------------------------- lending ------------------------------ */

  async credentialOrNull(market: PublicKey, holder: PublicKey) {
    const c = pda.credential(market, holder);
    return (await this.provider.connection.getAccountInfo(c)) ? c : null;
  }

  async initObligation(market: PublicKey, elevationGroup = 0) {
    await this.program.methods.initObligation(elevationGroup).accountsPartial({ owner: this.wallet, market }).rpc();
    return pda.obligation(market, this.wallet);
  }

  /** Supply liquidity and post the resulting kTokens as collateral in one transaction. */
  async depositCollateral(market: PublicKey, reserve: PublicKey, amount: bigint) {
    const r = await this.fetchReserve(reserve);
    const userLiquidity = getAssociatedTokenAddressSync(r.liquidityMint, this.wallet);
    const userCollateral = getAssociatedTokenAddressSync(r.collateralMint, this.wallet);
    const credential = await this.credentialOrNull(market, this.wallet);

    const ixs = [
      createAssociatedTokenAccountIdempotentInstruction(this.wallet, userCollateral, this.wallet, r.collateralMint),
      await this.refreshReserveIx(reserve, r.oracle),
      await this.program.methods
        .depositReserveLiquidity(new BN(amount.toString()))
        .accountsPartial({
          user: this.wallet, market, reserve, liquidityVault: r.liquidityVault, collateralMint: r.collateralMint,
          userLiquidity, userCollateral, credential, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction(),
      await this.program.methods
        .depositObligationCollateral(new BN("18446744073709551615")) // u64::MAX = whole kToken balance
        .accountsPartial({
          owner: this.wallet, market, obligation: pda.obligation(market, this.wallet), reserve,
          collateralVault: r.collateralVault, userCollateral, credential, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction(),
    ];
    return this.send(ixs);
  }

  /** Plain supply (earn) without collateralising. Returns kTokens minted. */
  async supply(market: PublicKey, reserve: PublicKey, amount: bigint) {
    const r = await this.fetchReserve(reserve);
    const userLiquidity = getAssociatedTokenAddressSync(r.liquidityMint, this.wallet);
    const userCollateral = getAssociatedTokenAddressSync(r.collateralMint, this.wallet);
    const credential = await this.credentialOrNull(market, this.wallet);
    return this.send([
      createAssociatedTokenAccountIdempotentInstruction(this.wallet, userCollateral, this.wallet, r.collateralMint),
      await this.refreshReserveIx(reserve, r.oracle),
      await this.program.methods
        .depositReserveLiquidity(new BN(amount.toString()))
        .accountsPartial({
          user: this.wallet, market, reserve, liquidityVault: r.liquidityVault, collateralMint: r.collateralMint,
          userLiquidity, userCollateral, credential, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction(),
    ]);
  }

  async borrow(market: PublicKey, reserve: PublicKey, amount: bigint) {
    const r = await this.fetchReserve(reserve);
    const obligation = pda.obligation(market, this.wallet);
    const userLiquidity = getAssociatedTokenAddressSync(r.liquidityMint, this.wallet);
    return this.send([
      createAssociatedTokenAccountIdempotentInstruction(this.wallet, userLiquidity, this.wallet, r.liquidityMint),
      ...(await this.refreshBundle(market, obligation, [reserve])),
      await this.program.methods
        .borrowObligationLiquidity(new BN(amount.toString()))
        .accountsPartial({ owner: this.wallet, market, obligation, reserve, liquidityVault: r.liquidityVault, userLiquidity, tokenProgram: TOKEN_PROGRAM_ID })
        .instruction(),
    ]);
  }

  async repay(market: PublicKey, obligation: PublicKey, reserve: PublicKey, amount: bigint) {
    const r = await this.fetchReserve(reserve);
    return this.send([
      await this.refreshReserveIx(reserve, r.oracle),
      await this.program.methods
        .repayObligationLiquidity(new BN(amount.toString()))
        .accountsPartial({
          payer: this.wallet, market, obligation, reserve, liquidityVault: r.liquidityVault,
          payerLiquidity: getAssociatedTokenAddressSync(r.liquidityMint, this.wallet), tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction(),
    ]);
  }

  async withdrawCollateral(market: PublicKey, reserve: PublicKey, ktokens: bigint) {
    const r = await this.fetchReserve(reserve);
    const obligation = pda.obligation(market, this.wallet);
    return this.send([
      ...(await this.refreshBundle(market, obligation)),
      await this.program.methods
        .withdrawObligationCollateral(new BN(ktokens.toString()))
        .accountsPartial({
          owner: this.wallet, market, obligation, reserve, collateralVault: r.collateralVault,
          userCollateral: getAssociatedTokenAddressSync(r.collateralMint, this.wallet), tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction(),
    ]);
  }

  /** Liquidate `obligation`: repay debt in `repayReserve`, seize kTokens of `withdrawReserve`. */
  async liquidate(market: PublicKey, obligation: PublicKey, repayReserve: PublicKey, withdrawReserve: PublicKey, maxRepay: bigint) {
    const [rr, wr] = await Promise.all([this.fetchReserve(repayReserve), this.fetchReserve(withdrawReserve)]);
    const liquidatorCollateral = getAssociatedTokenAddressSync(wr.collateralMint, this.wallet);
    return this.send([
      createAssociatedTokenAccountIdempotentInstruction(this.wallet, liquidatorCollateral, this.wallet, wr.collateralMint),
      ...(await this.refreshBundle(market, obligation)),
      await this.program.methods
        .liquidateObligation(new BN(maxRepay.toString()))
        .accountsPartial({
          liquidator: this.wallet, market, obligation,
          repayReserve, repayLiquidityVault: rr.liquidityVault,
          withdrawReserve, withdrawCollateralVault: wr.collateralVault,
          liquidatorLiquidity: getAssociatedTokenAddressSync(rr.liquidityMint, this.wallet),
          liquidatorCollateral,
          credential: await this.credentialOrNull(market, this.wallet),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction(),
    ]);
  }

  /** Burn kTokens for underlying liquidity (e.g. after a liquidation). */
  async redeem(market: PublicKey, reserve: PublicKey, ktokens: bigint) {
    const r = await this.fetchReserve(reserve);
    const userLiquidity = getAssociatedTokenAddressSync(r.liquidityMint, this.wallet);
    return this.send([
      createAssociatedTokenAccountIdempotentInstruction(this.wallet, userLiquidity, this.wallet, r.liquidityMint),
      await this.refreshReserveIx(reserve, r.oracle),
      await this.program.methods
        .redeemReserveCollateral(new BN(ktokens.toString()))
        .accountsPartial({
          user: this.wallet, market, reserve, liquidityVault: r.liquidityVault, collateralMint: r.collateralMint,
          userLiquidity, userCollateral: getAssociatedTokenAddressSync(r.collateralMint, this.wallet), tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction(),
    ]);
  }

  async socializeLoss(market: PublicKey, obligation: PublicKey, reserve: PublicKey) {
    return this.send([
      await this.refreshReserveIx(reserve),
      await this.program.methods.socializeLoss().accountsPartial({ market, obligation, reserve }).instruction(),
    ]);
  }

  /* ---------------------------------- vault ------------------------------- */

  async initVault(name: string, mint: PublicKey, feeBps: number, allocator: PublicKey = this.wallet) {
    const vault = pda.vault(this.wallet, name);
    const sharesMint = pda.vaultShares(vault);
    const feeReceiver = getAssociatedTokenAddressSync(sharesMint, this.wallet);
    await this.program.methods
      .initVault(name, feeBps, allocator)
      .accountsPartial({ curator: this.wallet, liquidityMint: mint, vault, feeReceiver })
      .postInstructions([createAssociatedTokenAccountIdempotentInstruction(this.wallet, feeReceiver, this.wallet, sharesMint)])
      .rpc();
    return vault;
  }

  async setAllocation(vault: PublicKey, reserve: PublicKey, cap: bigint) {
    const r = await this.fetchReserve(reserve);
    return this.program.methods
      .setAllocation(new BN(cap.toString()))
      .accountsPartial({ curator: this.wallet, vault, reserve, collateralMint: r.collateralMint })
      .rpc();
  }

  /** Refresh every allocated reserve and pass them as remaining accounts (AUM needs fresh exchange rates). */
  private async vaultRefresh(vault: PublicKey) {
    const v = await this.fetchVault(vault);
    const allocated = v.allocations.filter((a) => a.reserve.toBase58() !== PublicKey.default.toBase58() && !a.ktokens.isZero());
    const refresh = await Promise.all(allocated.map((a) => this.refreshReserveIx(a.reserve)));
    const remaining = allocated.map((a) => ({ pubkey: a.reserve, isSigner: false, isWritable: false }));
    return { v, refresh, remaining };
  }

  async vaultDeposit(vault: PublicKey, amount: bigint) {
    const { v, refresh, remaining } = await this.vaultRefresh(vault);
    const userShares = getAssociatedTokenAddressSync(v.sharesMint, this.wallet);
    return this.send([
      createAssociatedTokenAccountIdempotentInstruction(this.wallet, userShares, this.wallet, v.sharesMint),
      ...refresh,
      await this.program.methods
        .vaultDeposit(new BN(amount.toString()))
        .accountsPartial({
          user: this.wallet, vault, idleVault: v.idleVault, sharesMint: v.sharesMint,
          userLiquidity: getAssociatedTokenAddressSync(v.liquidityMint, this.wallet), userShares,
          feeReceiver: v.feeReceiver, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remaining)
        .instruction(),
    ]);
  }

  async vaultWithdraw(vault: PublicKey, shares: bigint) {
    const { v, refresh, remaining } = await this.vaultRefresh(vault);
    const userLiquidity = getAssociatedTokenAddressSync(v.liquidityMint, this.wallet);
    return this.send([
      createAssociatedTokenAccountIdempotentInstruction(this.wallet, userLiquidity, this.wallet, v.liquidityMint),
      ...refresh,
      await this.program.methods
        .vaultWithdraw(new BN(shares.toString()))
        .accountsPartial({
          user: this.wallet, vault, idleVault: v.idleVault, sharesMint: v.sharesMint, userLiquidity,
          userShares: getAssociatedTokenAddressSync(v.sharesMint, this.wallet), feeReceiver: v.feeReceiver, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remaining)
        .instruction(),
    ]);
  }

  private async vaultMoveAccounts(vault: PublicKey, reserve: PublicKey) {
    const [v, r] = await Promise.all([this.fetchVault(vault), this.fetchReserve(reserve)]);
    return {
      signer: this.wallet, vault, idleVault: v.idleVault, market: r.market, reserve,
      liquidityVault: r.liquidityVault, collateralMint: r.collateralMint,
      vaultKtokens: pda.vaultKTokens(vault, reserve), tokenProgram: TOKEN_PROGRAM_ID,
    };
  }

  async vaultInvest(vault: PublicKey, reserve: PublicKey, amount: bigint) {
    return this.send([
      await this.refreshReserveIx(reserve),
      await this.program.methods.vaultInvest(new BN(amount.toString())).accountsPartial(await this.vaultMoveAccounts(vault, reserve)).instruction(),
    ]);
  }

  async vaultDivest(vault: PublicKey, reserve: PublicKey, ktokens: bigint) {
    return this.send([
      await this.refreshReserveIx(reserve),
      await this.program.methods.vaultDivest(new BN(ktokens.toString())).accountsPartial(await this.vaultMoveAccounts(vault, reserve)).instruction(),
    ]);
  }

  /** Vault AUM using current reserve exchange rates (off-chain view). */
  async vaultAum(vault: PublicKey) {
    const v = await this.fetchVault(vault);
    const conn = this.provider.connection;
    const [sharesInfo, assetInfo] = await Promise.all([conn.getTokenSupply(v.sharesMint), conn.getTokenSupply(v.liquidityMint)]);
    const shareDec = 10 ** sharesInfo.value.decimals;
    const dec = 10 ** assetInfo.value.decimals;
    let aum = Number(v.idleAmount.toString()) / dec;
    const allocations = [];
    for (const a of v.allocations.filter((a) => a.reserve.toBase58() !== PublicKey.default.toBase58())) {
      const rv = await this.reserveView(a.reserve);
      const value = (Number(a.ktokens.toString()) / dec) * rv.ktokenRate; // kTokens share the asset's decimals
      aum += value;
      allocations.push({ reserve: a.reserve, value, cap: Number(a.cap.toString()) / dec, supplyApr: rv.supplyApr });
    }
    const supply = Number(v.sharesSupply.toString()) / shareDec;
    return { aum, idle: Number(v.idleAmount.toString()) / dec, sharePrice: supply > 0 ? aum / supply : 1, allocations };
  }

  /* --------------------------------- helpers ------------------------------ */

  async ktokenBalance(ata: PublicKey): Promise<bigint> {
    const info = await this.provider.connection.getAccountInfo(ata);
    if (!info) return 0n;
    return BigInt((await this.provider.connection.getTokenAccountBalance(ata)).value.amount);
  }
}

export { SystemProgram };
