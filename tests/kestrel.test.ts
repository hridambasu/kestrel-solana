/**
 * End-to-end tests against a local validator running the compiled program.
 *   npm run localnet   (separate terminal)
 *   npm run test:e2e
 */
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { KestrelClient, defaultReserveConfig, pda } from "../sdk/index.js";
import { BN } from "../sdk/anchor.js";
import { balance, clientFor, expectError, fund, loadKeypair, mintToOwner, newActor, newMint } from "./fixture.js";

const USDC = 10n ** 6n;
const SOL9 = 10n ** 9n;

let admin: Keypair;
let A: KestrelClient; // admin / curator / compliance
let market: PublicKey;
let usdcMint: PublicKey, lstMint: PublicKey, tbillMint: PublicKey;
let usdcFeed: PublicKey, lstFeed: PublicKey, tbillFeed: PublicKey;
let usdcReserve: PublicKey, lstReserve: PublicKey, tbillReserve: PublicKey;

describe("kestrel", () => {
  before(async () => {
    admin = loadKeypair();
    await fund(admin.publicKey, 100);
    A = clientFor(admin);

    usdcMint = await newMint(admin, 6);
    lstMint = await newMint(admin, 9);
    tbillMint = await newMint(admin, 6);

    usdcFeed = await A.initMockPrice(1.0);
    lstFeed = await A.initMockPrice(150.0);
    tbillFeed = await A.initMockPrice(1.05);

    market = await A.initMarket();
    // eMode 1: stablecoins + T-bills
    await A.setElevationGroup(market, { id: 1, ltvBps: 9200, liquidationThresholdBps: 9500, liquidationBonusBps: 200 });

    usdcReserve = await A.initReserve(market, usdcMint, usdcFeed, defaultReserveConfig({
      ltvBps: 8000, liquidationThresholdBps: 8500, liquidationBonusBps: 400, elevationGroup: 1,
    }));
    lstReserve = await A.initReserve(market, lstMint, lstFeed, defaultReserveConfig({
      ltvBps: 7000, liquidationThresholdBps: 7800, liquidationBonusBps: 700, borrowFactorBps: 12_500,
    }));
    tbillReserve = await A.initReserve(market, tbillMint, tbillFeed, defaultReserveConfig({
      ltvBps: 8500, liquidationThresholdBps: 9000, liquidationBonusBps: 300,
      permissioned: true, borrowEnabled: false, elevationGroup: 1,
    }));
  });

  it("supplier deposits USDC and receives kTokens 1:1 on first deposit", async () => {
    const s = await newActor();
    await mintToOwner(admin, usdcMint, s.kp.publicKey, 1_000_000n * USDC);
    await s.client.supply(market, usdcReserve, 1_000_000n * USDC);
    const r = await A.fetchReserve(usdcReserve);
    assert.equal(BigInt(r.availableAmount.toString()), 1_000_000n * USDC);
    assert.equal(await balance(getAssociatedTokenAddressSync(r.collateralMint, s.kp.publicKey)), 1_000_000n * USDC);
  });

  describe("crypto-collateral borrowing and liquidation", () => {
    let borrower: { kp: Keypair; client: KestrelClient };
    let obligation: PublicKey;

    before(async () => {
      borrower = await newActor();
      await mintToOwner(admin, lstMint, borrower.kp.publicKey, 100n * SOL9);
      obligation = await borrower.client.initObligation(market);
      await borrower.client.depositCollateral(market, lstReserve, 100n * SOL9); // $15,000
    });

    it("values collateral at the oracle price", async () => {
      await borrower.client.send(await borrower.client.refreshBundle(market, obligation));
      const o = await borrower.client.obligationView(obligation);
      assert.ok(Math.abs(o.depositedValue - 15_000) < 1, `deposited ${o.depositedValue}`);
      assert.ok(Math.abs(o.allowedBorrowValue - 10_500) < 1);
    });

    it("rejects a borrow above LTV", async () => {
      await expectError(borrower.client.borrow(market, usdcReserve, 10_600n * USDC), "BorrowTooLarge");
    });

    it("borrows within LTV", async () => {
      await borrower.client.borrow(market, usdcReserve, 9_000n * USDC);
      const usdcAta = getAssociatedTokenAddressSync(usdcMint, borrower.kp.publicKey);
      assert.equal(await balance(usdcAta), 9_000n * USDC);
    });

    it("borrow factor makes volatile debt cost more borrowing power", async () => {
      // A second user borrows the LST (borrow factor 1.25) against USDC collateral.
      const u = await newActor();
      await mintToOwner(admin, usdcMint, u.kp.publicKey, 10_000n * USDC);
      await u.client.initObligation(market);
      await u.client.depositCollateral(market, usdcReserve, 10_000n * USDC); // allowed = $8,000
      // supply some LST liquidity first
      const lp = await newActor();
      await mintToOwner(admin, lstMint, lp.kp.publicKey, 1_000n * SOL9);
      await lp.client.supply(market, lstReserve, 1_000n * SOL9);
      // $8,000 / 1.25 = $6,400 of LST max  => 42.6 LST at $150
      await expectError(u.client.borrow(market, lstReserve, 45n * SOL9), "BorrowTooLarge");
      await u.client.borrow(market, lstReserve, 40n * SOL9);
    });

    it("cannot withdraw collateral that backs the loan", async () => {
      await expectError(borrower.client.withdrawCollateral(market, lstReserve, 50n * SOL9), "WithdrawTooLarge");
    });

    it("healthy obligations cannot be liquidated", async () => {
      const liq = await newActor();
      await mintToOwner(admin, usdcMint, liq.kp.publicKey, 10_000n * USDC);
      await expectError(liq.client.liquidate(market, obligation, usdcReserve, lstReserve, 1_000n * USDC), "ObligationHealthy");
    });

    it("liquidates up to the close factor with a bonus after a price drop", async () => {
      await A.setMockPrice(lstFeed, 110); // 100 * 110 * 0.78 = 8,580 < 9,000 debt
      await borrower.client.send(await borrower.client.refreshBundle(market, obligation));
      const before = await borrower.client.obligationView(obligation);
      assert.ok(before.healthFactor < 1, `hf ${before.healthFactor}`);

      const liq = await newActor();
      await mintToOwner(admin, usdcMint, liq.kp.publicKey, 100_000n * USDC);
      await liq.client.liquidate(market, obligation, usdcReserve, lstReserve, 100_000n * USDC);

      const lst = await A.fetchReserve(lstReserve);
      const seized = await balance(getAssociatedTokenAddressSync(lst.collateralMint, liq.kp.publicKey));
      const paid = 100_000n * USDC - (await balance(getAssociatedTokenAddressSync(usdcMint, liq.kp.publicKey)));
      // close factor 50% of ~$9,000
      assert.ok(paid >= 4_499n * USDC && paid <= 4_502n * USDC, `paid ${paid}`);
      // seized value = paid * 1.07 at $110 => ~43.8 LST
      const seizedUsd = (Number(seized) / 1e9) * 110;
      assert.ok(Math.abs(seizedUsd / (Number(paid) / 1e6) - 1.07) < 0.002, `bonus ratio ${seizedUsd / (Number(paid) / 1e6)}`);

      await borrower.client.send(await borrower.client.refreshBundle(market, obligation));
      const after = await borrower.client.obligationView(obligation);
      assert.ok(after.healthFactor > before.healthFactor, "liquidation improved health");
    });

    it("writes off bad debt once collateral is exhausted", async () => {
      await A.setMockPrice(lstFeed, 20); // collateral now worth far less than debt
      const liq = await newActor();
      await mintToOwner(admin, usdcMint, liq.kp.publicKey, 100_000n * USDC);
      // keep liquidating until the obligation has no collateral
      for (let i = 0; i < 6; i++) {
        const o = await borrower.client.obligationView(obligation);
        if (o.deposits.length === 0) break;
        await liq.client.liquidate(market, obligation, usdcReserve, lstReserve, 100_000n * USDC);
      }
      const o = await borrower.client.obligationView(obligation);
      assert.equal(o.deposits.length, 0);
      assert.equal(o.borrows.length, 1, "residual debt remains");

      const before = await A.reserveView(usdcReserve);
      await liq.client.socializeLoss(market, obligation, usdcReserve);
      const after = await A.reserveView(usdcReserve);
      assert.ok(after.borrowed < before.borrowed, "debt written off");
      assert.ok(after.ktokenRate < before.ktokenRate, "suppliers absorb the loss via kToken rate");
      assert.equal((await borrower.client.obligationView(obligation)).borrows.length, 0);
      await A.setMockPrice(lstFeed, 150);
    });
  });

  describe("permissioned RWA collateral (tokenized T-bills)", () => {
    let fund_: { kp: Keypair; client: KestrelClient };

    before(async () => {
      fund_ = await newActor();
      await mintToOwner(admin, tbillMint, fund_.kp.publicKey, 100_000n * USDC);
    });

    it("rejects deposits without a credential", async () => {
      await fund_.client.initObligation(market, 1); // eMode: stables + T-bills
      await expectError(fund_.client.depositCollateral(market, tbillReserve, 100_000n * USDC), "CredentialRequired");
    });

    it("accepts deposits once compliance issues a credential, and eMode raises LTV", async () => {
      const now = Math.floor(Date.now() / 1000);
      await A.issueCredential(market, fund_.kp.publicKey, now + 365 * 86400);
      await fund_.client.depositCollateral(market, tbillReserve, 100_000n * USDC); // $105,000
      const obligation = pda.obligation(market, fund_.kp.publicKey);
      await fund_.client.send(await fund_.client.refreshBundle(market, obligation));
      const o = await fund_.client.obligationView(obligation);
      assert.ok(Math.abs(o.allowedBorrowValue - 105_000 * 0.92) < 1, `eMode LTV applied: ${o.allowedBorrowValue}`);
      await fund_.client.borrow(market, usdcReserve, 95_000n * USDC); // > 85% normal LTV, < 92% eMode
    });

    it("eMode obligations cannot borrow assets outside the group", async () => {
      await expectError(fund_.client.borrow(market, lstReserve, 1n * SOL9), "ElevationGroupMismatch");
    });

    it("only credentialed liquidators may seize RWA collateral", async () => {
      await A.setMockPrice(tbillFeed, 0.98); // 100k * 0.98 * 0.95 = 93.1k < 95k debt
      const obligation = pda.obligation(market, fund_.kp.publicKey);

      const anon = await newActor();
      await mintToOwner(admin, usdcMint, anon.kp.publicKey, 50_000n * USDC);
      await expectError(anon.client.liquidate(market, obligation, usdcReserve, tbillReserve, 10_000n * USDC), "CredentialRequired");

      const desk = await newActor();
      await mintToOwner(admin, usdcMint, desk.kp.publicKey, 50_000n * USDC);
      await A.issueCredential(market, desk.kp.publicKey, Math.floor(Date.now() / 1000) + 86400);
      await desk.client.liquidate(market, obligation, usdcReserve, tbillReserve, 10_000n * USDC);
      const tb = await A.fetchReserve(tbillReserve);
      assert.ok((await balance(getAssociatedTokenAddressSync(tb.collateralMint, desk.kp.publicKey))) > 0n);
    });
  });

  describe("curated earn vault", () => {
    let vault: PublicKey;
    let depositor: { kp: Keypair; client: KestrelClient };

    before(async () => {
      vault = await A.initVault(`usdc-prime-${market.toBase58().slice(0, 6)}`, usdcMint, 1000);
      await A.setAllocation(vault, usdcReserve, 200_000n * USDC);
      depositor = await newActor();
      await mintToOwner(admin, usdcMint, depositor.kp.publicKey, 250_000n * USDC);
    });

    it("refuses to allocate into a reserve of a different asset", async () => {
      await expectError(A.setAllocation(vault, tbillReserve, 1n), "MintMismatch"); // different mint
    });

    it("mints shares on deposit", async () => {
      await depositor.client.vaultDeposit(vault, 250_000n * USDC);
      const v = await A.fetchVault(vault);
      assert.equal(BigInt(v.idleAmount.toString()), 250_000n * USDC);
      assert.ok(BigInt(v.sharesSupply.toString()) > 0n);
    });

    it("allocator invests within caps", async () => {
      await A.vaultInvest(vault, usdcReserve, 200_000n * USDC);
      await expectError(A.vaultInvest(vault, usdcReserve, 1n * USDC), "AllocationCapExceeded");
      const view = await A.vaultAum(vault);
      assert.ok(Math.abs(view.aum - 250_000) < 1, `aum ${view.aum}`);
    });

    it("non-allocators cannot move funds", async () => {
      await expectError(depositor.client.vaultInvest(vault, usdcReserve, 1n), "Unauthorized");
    });

    it("withdraws from idle, and after divest", async () => {
      const v = await A.fetchVault(vault);
      const shares = BigInt(v.sharesSupply.toString());
      await depositor.client.vaultWithdraw(vault, shares / 10n); // ~25k from 50k idle
      await expectError(depositor.client.vaultWithdraw(vault, shares / 2n), "InsufficientIdle");

      const vk = pda.vaultKTokens(vault, usdcReserve);
      await A.vaultDivest(vault, usdcReserve, ((await balance(vk)) * 3n) / 4n); // headroom for accrued interest
      await depositor.client.vaultWithdraw(vault, shares / 2n);
      const usdc = await balance(getAssociatedTokenAddressSync(usdcMint, depositor.kp.publicKey));
      assert.ok(usdc > 149_000n * USDC, `received ${usdc}`);
    });
  });

  describe("oracle guards", () => {
    it("rejects stale prices", async () => {
      const feed = await A.initMockPrice(1);
      const mint = await newMint(admin, 6);
      const r = await A.initReserve(market, mint, feed, defaultReserveConfig({ maxPriceAgeS: 1 }));
      await new Promise((res) => setTimeout(res, 3000));
      await expectError(A.send([await A.refreshReserveIx(r)]), "StalePrice");
    });

    it("rejects wide confidence intervals", async () => {
      const feed = await A.initMockPrice(1);
      const mint = await newMint(admin, 6);
      const r = await A.initReserve(market, mint, feed, defaultReserveConfig({ maxConfBps: 100 }));
      await A.setMockPrice(feed, 1, { confBps: 300 });
      await expectError(A.send([await A.refreshReserveIx(r)]), "PriceConfidenceTooWide");
    });

    it("rejects an oracle that does not match the reserve", async () => {
      const ix = await A.program.methods.refreshReserve().accountsPartial({ reserve: usdcReserve, oracle: lstFeed }).instruction();
      await expectError(A.send([ix]), "OracleMismatch");
    });

    it("values collateral at min(spot, ema)", async () => {
      await A.setMockPrice(lstFeed, 150, { ema: 140 });
      await A.send([await A.refreshReserveIx(lstReserve)]);
      const r = await A.fetchReserve(lstReserve);
      assert.equal(BigInt(r.priceLowerWads.toString()), 140n * 10n ** 18n);
      assert.equal(BigInt(r.priceUpperWads.toString()), 150n * 10n ** 18n);
      await A.setMockPrice(lstFeed, 150);
    });
  });

  describe("access control", () => {
    it("only the admin can configure reserves", async () => {
      const rando = await newActor();
      await expectError(
        rando.client.program.methods
          .updateReserveConfig(defaultReserveConfig() as never)
          .accountsPartial({ admin: rando.kp.publicKey, market, reserve: usdcReserve })
          .rpc(),
        "Unauthorized",
      );
    });

    it("rejects configs where liquidation would create bad debt by construction", async () => {
      const mint = await newMint(admin, 6);
      const feed = await A.initMockPrice(1);
      await expectError(
        A.initReserve(market, mint, feed, defaultReserveConfig({ ltvBps: 9000, liquidationThresholdBps: 9500, liquidationBonusBps: 600 })),
        "InvalidConfig",
      );
    });

    it("only the compliance authority can issue credentials", async () => {
      const rando = await newActor();
      await expectError(rando.client.issueCredential(market, rando.kp.publicKey, 2_000_000_000), "Unauthorized");
    });
  });
});

void BN;
