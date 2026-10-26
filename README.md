# Kestrel — Solana lending with RWA collateral, eMode and curated earn vaults

Kestrel is an Anchor program implementing a Kamino/Solend-style money market,
aimed at where Solana lending is heading in 2026: **tokenized real-world assets
as collateral**, **credential-gated (permissioned) reserves**, **elevation groups
(eMode)** for correlated assets, and **curated earn vaults** that allocate
deposits across reserves.

It ships end to end: the on-chain program, a TypeScript SDK, Rust unit and
property tests, end-to-end tests against a real `solana-test-validator`, a
liquidation keeper, a vault allocator, a local price pusher standing in for Pyth,
and a React risk monitor.

```
           ┌──────────────── Market (admin, compliance authority, eMode groups) ────────────────┐
           │                                                                                     │
           │   Reserve USDC          Reserve jitoSOL           Reserve tBILL (permissioned RWA)  │
           │   kToken: kUSDC         kToken: kjitoSOL          kToken: ktBILL · collateral only  │
           │   kinked rate curve     borrow factor 1.25x       eMode 1 with USDC: 92% LTV        │
           │        ▲    ▲                  ▲                          ▲                          │
           │        │    │      Obligation (per user): up to 4 deposits + 4 borrows              │
           │        │    │      refreshed in-tx: refresh_reserve* → refresh_obligation → action   │
           └────────┼────┼──────────────────────────────────────────────────────────────────────┘
                    │    └── EarnVault "USDC Prime": shares, caps per reserve, perf fee, idle buffer ◀── allocator bot
                    └────── liquidations (close factor 50%, bonus per reserve/eMode) ◀── keeper bot
```

## What's in here

| Path | What it is |
|---|---|
| `programs/kestrel/src/state/` | `Market`, `Reserve` (+`ReserveConfig`), `Obligation`, `EarnVault`, `Credential`, `MockPrice`. All interest, exchange-rate and health logic lives here as pure methods, so it's unit-testable without a validator. |
| `programs/kestrel/src/instructions/` | 26 instructions: admin (markets, reserves, eMode, credentials), lending (refresh, supply/redeem, collateral in/out, borrow, repay, liquidate, socialise loss), vault (init, allocations, deposit/withdraw, invest/divest). |
| `programs/kestrel/src/oracle.rs` | Parses Pyth pull-oracle `PriceUpdateV2` accounts directly (owner check, full verification only), with staleness and confidence guards. Stores `min(spot, EMA)` for collateral and `max(spot, EMA)` for debt. |
| `programs/kestrel/src/math.rs` | WAD fixed point with a 256-bit `mul_div`, the kinked rate curve, and continuous compounding via a Taylor expansion on `r·t`. |
| `sdk/` | TypeScript client: PDAs, refresh-bundle builder, typed views (APR, utilisation, health), and an off-chain health mirror (`health.ts`) for cheap scanning. |
| `tests/kestrel.test.ts` | 25 end-to-end tests on a local validator. |
| `keeper/` | `liquidator.ts` (one `getProgramAccounts` scan, off-chain health, liquidate and redeem) and `allocator.ts` (idle-buffer and yield policy). |
| `scripts/` | `localnet.sh`, `seed.ts`, `price-pusher.ts`, `crash.ts`, `status.ts`, `build-idl.py`, `gen-types.mjs`. |
| `app/` | React risk monitor: health ladder of every borrower, positions, reserves, vault allocations. |

## Run it

Requires the Solana CLI (Agave 2.1+), Anchor 0.31.1, Rust and Node 20+.

```bash
npm install
npm run test:unit         # 20 Rust unit + property tests (no validator needed)
npm run build             # SBF program + IDL + TS types

npm run localnet          # terminal 1: validator with the program preloaded
npm run test:e2e          # 25 end-to-end tests
npm run seed              # market, reserves, vault, 4 borrowers → deployments/localnet.json
npm run pusher -- --walk  # terminal 2: keeps oracle prices fresh (stand-in for Pyth)
npm run keeper            # terminal 3: liquidation bot
npm run allocator         # terminal 4: vault allocator
npm run ui                # terminal 5: dashboard at http://localhost:5173
npm run crash -- 12       # drop jitoSOL 12% and watch the keeper act
```

Sample run:

```
[crash] jitoSOL 150.00 -> 132.00 (-12%)
[liq] 9DTptrRM HF=0.9900 debt=$104000 -> repay USDC, seize jitoSOL
[liq] ✔ liquidated 9DTptrRM, redeemed 421.52 jitoSOL
[alloc] ✔ invested $100000 into USDC
```

## Design decisions worth discussing

- **Refresh-then-act, enforced on-chain.** Health-sensitive instructions require `last_update_ts == now` on the reserves and the obligation. The SDK prepends `refresh_reserve`/`refresh_obligation` in the same transaction, so a position is never valued on stale prices or un-accrued debt. This mirrors Solend and Kamino and avoids double-mutable-account pitfalls.
- **RWA compliance is part of the protocol, not just the UI.** Permissioned reserves need a `Credential` PDA, issued and revoked by the market's compliance authority, to deposit. **Liquidators also need one to seize that collateral**, because tokenized fund shares can't be transferred to arbitrary holders. Vaults refuse to allocate into permissioned reserves.
- **eMode.** Obligations that only hold assets from one elevation group (USDC + tBILL) get 92% LTV with debt weighted 1x. Outside eMode, volatile debt carries a borrow factor (jitoSOL 1.25x), so shorting it costs more borrowing power.
- **Oracle conservatism.** Collateral is valued at `min(spot, EMA)` and debt at `max(spot, EMA)`, so a one-slot price spike can't inflate borrowing power or trigger cascading liquidations. Partially verified Pyth updates are rejected.
- **Accounting that resists manipulation.** Reserve liquidity is tracked in state, not read from the vault's token balance, so donations can't move the kToken exchange rate. Vault shares use virtual offsets and carry 3 extra decimals so one share starts at one USDC.
- **Bad debt is explicit.** When an obligation has no collateral left, `socialize_loss` (permissionless) writes the residual debt off against that reserve's suppliers. Phantom assets never sit on the books.
- **Config validation.** Configurations where `liquidation_threshold × (1 + bonus) ≥ 100%` are rejected, since every liquidation in such a reserve would create bad debt.

## Build notes

The Agave 2.1 SBF toolchain ships Cargo 1.79, so `Cargo.lock` is resolved MSRV-aware and pins a few crates (blake3 1.5.5, wasip2 1.0.1) that otherwise pull edition-2024 manifests. `scripts/build-idl.py` produces the same IDL as `anchor idl build` without the CLI's nightly-toolchain download, which is useful offline or in CI.

## Production gaps (honest list)

Not audited. Uses classic SPL Token only; real RWA tokens are often Token-2022 with transfer hooks, which the reserve vaults would need to support. Liquidations need inventory in the debt asset; a production keeper would wrap them in a flash loan and Jupiter swap in one transaction. There are no flash loans, fixed-rate/term loans, or vault cap timelocks (the EVM project, Meridian, shows that pattern). The vault withdraws only from idle liquidity, so the allocator must keep a buffer or bundle a divest. The 4-deposit/4-borrow obligation size is a deliberate compute trade-off.
