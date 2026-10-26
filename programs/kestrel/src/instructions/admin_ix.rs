use crate::errors::KestrelError;
use crate::math::WAD;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

/* -------------------------------- market -------------------------------- */

#[derive(Accounts)]
pub struct InitMarket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Market::INIT_SPACE)]
    pub market: Box<Account<'info, Market>>,
    /// CHECK: PDA that owns all token vaults and mints for this market.
    #[account(seeds = [b"authority", market.key().as_ref()], bump)]
    pub market_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn init_market(ctx: Context<InitMarket>, compliance_authority: Pubkey) -> Result<()> {
    let m = &mut ctx.accounts.market;
    m.admin = ctx.accounts.admin.key();
    m.compliance_authority = compliance_authority;
    m.close_factor_bps = 5_000;
    m.dust_debt_wads = 2 * WAD; // positions under $2 can be closed in one liquidation
    m.paused = false;
    m.elevation_groups = Default::default();
    m.bump = ctx.bumps.market_authority;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateMarket<'info> {
    pub admin: Signer<'info>,
    #[account(mut, has_one = admin @ KestrelError::Unauthorized)]
    pub market: Box<Account<'info, Market>>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MarketUpdate {
    pub paused: Option<bool>,
    pub close_factor_bps: Option<u16>,
    pub compliance_authority: Option<Pubkey>,
    pub elevation_group: Option<ElevationGroup>,
}

pub fn update_market(ctx: Context<UpdateMarket>, u: MarketUpdate) -> Result<()> {
    let m = &mut ctx.accounts.market;
    if let Some(p) = u.paused {
        m.paused = p;
    }
    if let Some(cf) = u.close_factor_bps {
        require!(cf > 0 && cf <= 10_000, KestrelError::InvalidConfig);
        m.close_factor_bps = cf;
    }
    if let Some(c) = u.compliance_authority {
        m.compliance_authority = c;
    }
    if let Some(g) = u.elevation_group {
        require!(g.id >= 1 && g.id as usize <= MAX_ELEVATION_GROUPS, KestrelError::InvalidElevationGroup);
        require!(g.ltv_bps < g.liquidation_threshold_bps && g.liquidation_threshold_bps <= 9_800, KestrelError::InvalidConfig);
        require!(
            (g.liquidation_threshold_bps as u128) * (10_000 + g.liquidation_bonus_bps as u128) < 100_000_000,
            KestrelError::InvalidConfig
        );
        m.elevation_groups[g.id as usize - 1] = g;
    }
    Ok(())
}

/* -------------------------------- reserve ------------------------------- */

#[derive(Accounts)]
pub struct InitReserve<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(has_one = admin @ KestrelError::Unauthorized)]
    pub market: Box<Account<'info, Market>>,
    /// CHECK: market PDA authority
    #[account(seeds = [b"authority", market.key().as_ref()], bump = market.bump)]
    pub market_authority: UncheckedAccount<'info>,
    pub liquidity_mint: Box<Account<'info, Mint>>,
    #[account(
        init, payer = admin, space = 8 + Reserve::INIT_SPACE,
        seeds = [b"reserve", market.key().as_ref(), liquidity_mint.key().as_ref()], bump
    )]
    pub reserve: Box<Account<'info, Reserve>>,
    #[account(
        init, payer = admin, seeds = [b"liquidity", reserve.key().as_ref()], bump,
        token::mint = liquidity_mint, token::authority = market_authority
    )]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init, payer = admin, seeds = [b"kmint", reserve.key().as_ref()], bump,
        mint::decimals = liquidity_mint.decimals, mint::authority = market_authority
    )]
    pub collateral_mint: Box<Account<'info, Mint>>,
    #[account(
        init, payer = admin, seeds = [b"kvault", reserve.key().as_ref()], bump,
        token::mint = collateral_mint, token::authority = market_authority
    )]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,
    /// CHECK: validated on every refresh by `oracle::read_price`.
    pub oracle: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn init_reserve(ctx: Context<InitReserve>, config: ReserveConfig) -> Result<()> {
    config.validate()?;
    if config.elevation_group != 0 {
        require!(ctx.accounts.market.elevation_group(config.elevation_group).is_some(), KestrelError::InvalidElevationGroup);
    }
    let r = &mut ctx.accounts.reserve;
    r.market = ctx.accounts.market.key();
    r.liquidity_mint = ctx.accounts.liquidity_mint.key();
    r.liquidity_vault = ctx.accounts.liquidity_vault.key();
    r.collateral_mint = ctx.accounts.collateral_mint.key();
    r.collateral_vault = ctx.accounts.collateral_vault.key();
    r.oracle = ctx.accounts.oracle.key();
    r.decimals = ctx.accounts.liquidity_mint.decimals;
    r.available_amount = 0;
    r.borrowed_amount_wads = 0;
    r.cumulative_borrow_rate_wads = WAD;
    r.accumulated_protocol_fees_wads = 0;
    r.collateral_mint_supply = 0;
    r.price_lower_wads = 0;
    r.price_upper_wads = 0;
    r.last_update_ts = Clock::get()?.unix_timestamp;
    r.config = config;
    r.bump = ctx.bumps.reserve;
    r.vault_bump = ctx.bumps.liquidity_vault;
    r.collateral_mint_bump = ctx.bumps.collateral_mint;
    r.collateral_vault_bump = ctx.bumps.collateral_vault;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateReserveConfig<'info> {
    pub admin: Signer<'info>,
    #[account(has_one = admin @ KestrelError::Unauthorized)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, has_one = market)]
    pub reserve: Box<Account<'info, Reserve>>,
}

pub fn update_reserve_config(ctx: Context<UpdateReserveConfig>, config: ReserveConfig) -> Result<()> {
    config.validate()?;
    if config.elevation_group != 0 {
        require!(ctx.accounts.market.elevation_group(config.elevation_group).is_some(), KestrelError::InvalidElevationGroup);
    }
    ctx.accounts.reserve.config = config;
    Ok(())
}

/* ------------------------------ credentials ----------------------------- */

#[derive(Accounts)]
#[instruction(holder: Pubkey)]
pub struct IssueCredential<'info> {
    #[account(mut)]
    pub compliance_authority: Signer<'info>,
    #[account(has_one = compliance_authority @ KestrelError::Unauthorized)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        init_if_needed, payer = compliance_authority, space = 8 + Credential::INIT_SPACE,
        seeds = [b"credential", market.key().as_ref(), holder.as_ref()], bump
    )]
    pub credential: Account<'info, Credential>,
    pub system_program: Program<'info, System>,
}

pub fn issue_credential(ctx: Context<IssueCredential>, holder: Pubkey, expires_at: i64) -> Result<()> {
    let c = &mut ctx.accounts.credential;
    c.market = ctx.accounts.market.key();
    c.holder = holder;
    c.expires_at = expires_at;
    c.revoked = false;
    c.bump = ctx.bumps.credential;
    Ok(())
}

#[derive(Accounts)]
pub struct RevokeCredential<'info> {
    pub compliance_authority: Signer<'info>,
    #[account(has_one = compliance_authority @ KestrelError::Unauthorized)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, has_one = market)]
    pub credential: Account<'info, Credential>,
}

pub fn revoke_credential(ctx: Context<RevokeCredential>) -> Result<()> {
    ctx.accounts.credential.revoked = true;
    Ok(())
}

/* ------------------------------ mock oracle ----------------------------- */

#[derive(Accounts)]
pub struct InitMockPrice<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + MockPrice::INIT_SPACE)]
    pub price: Account<'info, MockPrice>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetMockPrice<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority @ KestrelError::Unauthorized)]
    pub price: Account<'info, MockPrice>,
}

pub fn set_mock_price(price: &mut MockPrice, p: i64, conf: u64, expo: i32, ema: i64) -> Result<()> {
    require!(cfg!(feature = "mock-oracle"), KestrelError::InvalidOracle);
    price.price = p;
    price.conf = conf;
    price.expo = expo;
    price.ema_price = ema;
    price.publish_time = Clock::get()?.unix_timestamp;
    Ok(())
}
