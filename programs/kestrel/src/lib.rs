//! # Kestrel
//!
//! Solana lending protocol focused on credit infrastructure:
//!  * cross-collateral obligations with kToken receipts and a cumulative borrow index,
//!  * kinked rate curves, borrow factors and elevation groups (eMode),
//!  * permissioned reserves for tokenized RWAs (credential-gated deposit *and* liquidation),
//!  * Pyth pull-oracle pricing with staleness / confidence guards and spot-vs-EMA bounds,
//!  * close-factor liquidations and explicit bad-debt socialisation,
//!  * curated earn vaults allocating across reserves under per-reserve caps.

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod math;
pub mod oracle;
pub mod state;
pub mod utils;

use instructions::*;
use state::{ElevationGroup, ReserveConfig};

declare_id!("BMM1yXCNsQMthdy6Q5xDZy6Lm26xrGtUqgo5dS6AKKx4");

#[program]
pub mod kestrel {
    use super::*;

    // ---- admin
    pub fn init_market(ctx: Context<InitMarket>, compliance_authority: Pubkey) -> Result<()> {
        admin_ix::init_market(ctx, compliance_authority)
    }
    pub fn update_market(ctx: Context<UpdateMarket>, update: MarketUpdate) -> Result<()> {
        admin_ix::update_market(ctx, update)
    }
    pub fn init_reserve(ctx: Context<InitReserve>, config: ReserveConfig) -> Result<()> {
        admin_ix::init_reserve(ctx, config)
    }
    pub fn update_reserve_config(ctx: Context<UpdateReserveConfig>, config: ReserveConfig) -> Result<()> {
        admin_ix::update_reserve_config(ctx, config)
    }
    pub fn issue_credential(ctx: Context<IssueCredential>, holder: Pubkey, expires_at: i64) -> Result<()> {
        admin_ix::issue_credential(ctx, holder, expires_at)
    }
    pub fn revoke_credential(ctx: Context<RevokeCredential>) -> Result<()> {
        admin_ix::revoke_credential(ctx)
    }
    pub fn init_mock_price(ctx: Context<InitMockPrice>, price: i64, conf: u64, expo: i32, ema: i64) -> Result<()> {
        ctx.accounts.price.authority = ctx.accounts.authority.key();
        admin_ix::set_mock_price(&mut ctx.accounts.price, price, conf, expo, ema)
    }
    pub fn set_mock_price(ctx: Context<SetMockPrice>, price: i64, conf: u64, expo: i32, ema: i64) -> Result<()> {
        admin_ix::set_mock_price(&mut ctx.accounts.price, price, conf, expo, ema)
    }

    // ---- lending
    pub fn refresh_reserve(ctx: Context<RefreshReserve>) -> Result<()> {
        lending_ix::refresh_reserve(ctx)
    }
    pub fn deposit_reserve_liquidity(ctx: Context<DepositReserveLiquidity>, amount: u64) -> Result<()> {
        lending_ix::deposit_reserve_liquidity(ctx, amount)
    }
    pub fn redeem_reserve_collateral(ctx: Context<RedeemReserveCollateral>, ktokens: u64) -> Result<()> {
        lending_ix::redeem_reserve_collateral(ctx, ktokens)
    }
    pub fn init_obligation(ctx: Context<InitObligation>, elevation_group: u8) -> Result<()> {
        lending_ix::init_obligation(ctx, elevation_group)
    }
    pub fn refresh_obligation<'info>(ctx: Context<'_, '_, 'info, 'info, RefreshObligation<'info>>) -> Result<()> {
        lending_ix::refresh_obligation(ctx)
    }
    pub fn set_elevation_group(ctx: Context<SetElevationGroup>, group: u8) -> Result<()> {
        lending_ix::set_elevation_group(ctx, group)
    }
    pub fn deposit_obligation_collateral(ctx: Context<DepositObligationCollateral>, ktokens: u64) -> Result<()> {
        lending_ix::deposit_obligation_collateral(ctx, ktokens)
    }
    pub fn withdraw_obligation_collateral(ctx: Context<WithdrawObligationCollateral>, ktokens: u64) -> Result<()> {
        lending_ix::withdraw_obligation_collateral(ctx, ktokens)
    }
    pub fn borrow_obligation_liquidity(ctx: Context<BorrowObligationLiquidity>, amount: u64) -> Result<()> {
        lending_ix::borrow_obligation_liquidity(ctx, amount)
    }
    pub fn repay_obligation_liquidity(ctx: Context<RepayObligationLiquidity>, amount: u64) -> Result<()> {
        lending_ix::repay_obligation_liquidity(ctx, amount)
    }
    pub fn liquidate_obligation(ctx: Context<LiquidateObligation>, max_repay_amount: u64) -> Result<()> {
        lending_ix::liquidate_obligation(ctx, max_repay_amount)
    }
    pub fn socialize_loss(ctx: Context<SocializeLoss>) -> Result<()> {
        lending_ix::socialize_loss(ctx)
    }

    // ---- earn vault
    pub fn init_vault(ctx: Context<InitVault>, name: String, performance_fee_bps: u16, allocator: Pubkey) -> Result<()> {
        vault_ix::init_vault(ctx, name, performance_fee_bps, allocator)
    }
    pub fn set_allocation(ctx: Context<SetAllocation>, cap: u64) -> Result<()> {
        vault_ix::set_allocation(ctx, cap)
    }
    pub fn vault_deposit<'info>(ctx: Context<'_, '_, 'info, 'info, VaultDeposit<'info>>, amount: u64) -> Result<()> {
        vault_ix::vault_deposit(ctx, amount)
    }
    pub fn vault_withdraw<'info>(ctx: Context<'_, '_, 'info, 'info, VaultWithdraw<'info>>, shares: u64) -> Result<()> {
        vault_ix::vault_withdraw(ctx, shares)
    }
    pub fn vault_invest(ctx: Context<VaultMove>, amount: u64) -> Result<()> {
        vault_ix::vault_invest(ctx, amount)
    }
    pub fn vault_divest(ctx: Context<VaultMove>, ktokens: u64) -> Result<()> {
        vault_ix::vault_divest(ctx, ktokens)
    }
}

// Re-export for clients.
pub use state::ElevationGroup as ElevationGroupConfig;
#[allow(unused_imports)]
use ElevationGroup as _;
