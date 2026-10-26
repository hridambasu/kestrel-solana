use crate::errors::KestrelError;
use crate::math::*;
use crate::oracle::read_price;
use crate::state::*;
use crate::utils::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

/* ----------------------------- refresh reserve ---------------------------- */

#[derive(Accounts)]
pub struct RefreshReserve<'info> {
    #[account(mut, has_one = oracle @ KestrelError::OracleMismatch)]
    pub reserve: Box<Account<'info, Reserve>>,
    /// CHECK: owner + layout validated in `read_price`.
    pub oracle: UncheckedAccount<'info>,
}

/// Permissionless: accrue interest and pull a fresh oracle price.
/// Must precede (in the same transaction) any instruction that values positions.
pub fn refresh_reserve(ctx: Context<RefreshReserve>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let r = &mut ctx.accounts.reserve;
    let price = read_price(&ctx.accounts.oracle, now, r.config.max_price_age_s, r.config.max_conf_bps)?;
    r.refresh(now, Some(price))
}

/* -------------------------- supply / redeem liquidity ---------------------- */

#[derive(Accounts)]
pub struct DepositReserveLiquidity<'info> {
    pub user: Signer<'info>,
    pub market: Box<Account<'info, Market>>,
    /// CHECK: market PDA
    #[account(seeds = [b"authority", market.key().as_ref()], bump = market.bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(mut, has_one = market, has_one = liquidity_vault, has_one = collateral_mint)]
    pub reserve: Box<Account<'info, Reserve>>,
    #[account(mut)]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub collateral_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = reserve.liquidity_mint, token::authority = user)]
    pub user_liquidity: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = collateral_mint)]
    pub user_collateral: Box<Account<'info, TokenAccount>>,
    #[account(seeds = [b"credential", market.key().as_ref(), user.key().as_ref()], bump)]
    pub credential: Option<Account<'info, Credential>>,
    pub token_program: Program<'info, Token>,
}

pub fn deposit_reserve_liquidity(ctx: Context<DepositReserveLiquidity>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    require!(!a.market.paused, KestrelError::MarketPaused);
    a.reserve.require_fresh(now)?;
    check_credential(&a.reserve, &a.user.key(), a.credential.as_ref(), now)?;

    let minted = ctx.accounts.reserve.deposit(amount)?;
    let a = &ctx.accounts;
    transfer_user(&a.token_program, a.user_liquidity.to_account_info(), a.liquidity_vault.to_account_info(), a.user.to_account_info(), amount)?;
    let mk = a.market.key();
    let seeds: &[&[&[u8]]] = &[&[MARKET_AUTHORITY_SEED, mk.as_ref(), &[a.market.bump]]];
    mint_signed(&a.token_program, a.collateral_mint.to_account_info(), a.user_collateral.to_account_info(), a.market_authority.to_account_info(), seeds, minted)?;
    emit!(LiquidityDeposited { reserve: a.reserve.key(), user: a.user.key(), amount, ktokens: minted });
    Ok(())
}

#[derive(Accounts)]
pub struct RedeemReserveCollateral<'info> {
    pub user: Signer<'info>,
    pub market: Box<Account<'info, Market>>,
    /// CHECK: market PDA
    #[account(seeds = [b"authority", market.key().as_ref()], bump = market.bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(mut, has_one = market, has_one = liquidity_vault, has_one = collateral_mint)]
    pub reserve: Box<Account<'info, Reserve>>,
    #[account(mut)]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub collateral_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = reserve.liquidity_mint)]
    pub user_liquidity: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = collateral_mint, token::authority = user)]
    pub user_collateral: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

/// Redeeming is allowed while paused: users can always exit with free liquidity.
pub fn redeem_reserve_collateral(ctx: Context<RedeemReserveCollateral>, ktokens: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.reserve.require_fresh(now)?;
    let amount = ctx.accounts.reserve.redeem(ktokens)?;
    let a = &ctx.accounts;
    burn_user(&a.token_program, a.collateral_mint.to_account_info(), a.user_collateral.to_account_info(), a.user.to_account_info(), ktokens)?;
    let mk = a.market.key();
    let seeds: &[&[&[u8]]] = &[&[MARKET_AUTHORITY_SEED, mk.as_ref(), &[a.market.bump]]];
    transfer_signed(&a.token_program, a.liquidity_vault.to_account_info(), a.user_liquidity.to_account_info(), a.market_authority.to_account_info(), seeds, amount)?;
    emit!(LiquidityRedeemed { reserve: a.reserve.key(), user: a.user.key(), amount, ktokens });
    Ok(())
}

/* ------------------------------- obligations ------------------------------ */

#[derive(Accounts)]
pub struct InitObligation<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub market: Box<Account<'info, Market>>,
    #[account(
        init, payer = owner, space = 8 + Obligation::INIT_SPACE,
        seeds = [b"obligation", market.key().as_ref(), owner.key().as_ref()], bump
    )]
    pub obligation: Box<Account<'info, Obligation>>,
    pub system_program: Program<'info, System>,
}

pub fn init_obligation(ctx: Context<InitObligation>, elevation_group: u8) -> Result<()> {
    if elevation_group != 0 {
        require!(ctx.accounts.market.elevation_group(elevation_group).is_some(), KestrelError::InvalidElevationGroup);
    }
    let o = &mut ctx.accounts.obligation;
    o.market = ctx.accounts.market.key();
    o.owner = ctx.accounts.owner.key();
    o.elevation_group = elevation_group;
    o.deposits = Default::default();
    o.borrows = Default::default();
    o.last_update_ts = 0;
    o.bump = ctx.bumps.obligation;
    Ok(())
}

#[derive(Accounts)]
pub struct RefreshObligation<'info> {
    pub market: Box<Account<'info, Market>>,
    #[account(mut, has_one = market)]
    pub obligation: Box<Account<'info, Obligation>>,
    // remaining_accounts: every reserve in `obligation.active_reserves()` order, already refreshed.
}

pub fn refresh_obligation<'info>(ctx: Context<'_, '_, 'info, 'info, RefreshObligation<'info>>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let active = ctx.accounts.obligation.active_reserves();
    require!(ctx.remaining_accounts.len() == active.len(), KestrelError::InvalidRemainingAccounts);
    let (reserves, keys) = load_reserves(ctx.remaining_accounts, &ctx.accounts.market.key())?;
    for (k, expected) in keys.iter().zip(active.iter()) {
        require_keys_eq!(*k, *expected, KestrelError::InvalidRemainingAccounts);
    }
    let market = ctx.accounts.market.as_ref().clone();
    ctx.accounts.obligation.refresh(&market, &reserves, &keys, now)
}

/// Switch elevation group. Only allowed while the obligation has no debt.
#[derive(Accounts)]
pub struct SetElevationGroup<'info> {
    pub owner: Signer<'info>,
    pub market: Box<Account<'info, Market>>,
    #[account(mut, has_one = market, has_one = owner @ KestrelError::Unauthorized)]
    pub obligation: Box<Account<'info, Obligation>>,
}

pub fn set_elevation_group(ctx: Context<SetElevationGroup>, group: u8) -> Result<()> {
    if group != 0 {
        require!(ctx.accounts.market.elevation_group(group).is_some(), KestrelError::InvalidElevationGroup);
    }
    let o = &mut ctx.accounts.obligation;
    require!(o.borrows.iter().all(|b| b.reserve == Pubkey::default()), KestrelError::ElevationGroupMismatch);
    o.elevation_group = group;
    o.last_update_ts = 0; // force a refresh (re-checks group membership)
    Ok(())
}

/* --------------------------- collateral in / out -------------------------- */

#[derive(Accounts)]
pub struct DepositObligationCollateral<'info> {
    pub owner: Signer<'info>,
    pub market: Box<Account<'info, Market>>,
    #[account(mut, has_one = market, has_one = owner @ KestrelError::Unauthorized)]
    pub obligation: Box<Account<'info, Obligation>>,
    #[account(has_one = market, has_one = collateral_vault)]
    pub reserve: Box<Account<'info, Reserve>>,
    #[account(mut)]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = reserve.collateral_mint, token::authority = owner)]
    pub user_collateral: Box<Account<'info, TokenAccount>>,
    #[account(seeds = [b"credential", market.key().as_ref(), owner.key().as_ref()], bump)]
    pub credential: Option<Account<'info, Credential>>,
    pub token_program: Program<'info, Token>,
}

/// `ktokens = u64::MAX` posts the caller's entire kToken balance (handy right
/// after `deposit_reserve_liquidity` in the same transaction).
pub fn deposit_obligation_collateral(ctx: Context<DepositObligationCollateral>, ktokens: u64) -> Result<()> {
    let ktokens = if ktokens == u64::MAX { ctx.accounts.user_collateral.amount } else { ktokens };
    require!(ktokens > 0, KestrelError::ZeroAmount);
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    require!(!a.market.paused, KestrelError::MarketPaused);
    check_credential(&a.reserve, &a.owner.key(), a.credential.as_ref(), now)?;
    if let Some(g) = a.market.elevation_group(a.obligation.elevation_group) {
        require!(a.reserve.config.elevation_group == g.id, KestrelError::ElevationGroupMismatch);
    }
    require!(a.reserve.config.liquidation_threshold_bps > 0, KestrelError::InvalidConfig);

    let reserve_key = a.reserve.key();
    transfer_user(&a.token_program, a.user_collateral.to_account_info(), a.collateral_vault.to_account_info(), a.owner.to_account_info(), ktokens)?;
    let o = &mut ctx.accounts.obligation;
    let i = o.find_or_add_deposit(reserve_key)?;
    o.deposits[i].deposited_amount = o.deposits[i].deposited_amount.checked_add(ktokens).ok_or(KestrelError::MathOverflow)?;
    o.last_update_ts = 0; // stale until refreshed
    emit!(CollateralDeposited { obligation: o.key(), reserve: reserve_key, ktokens });
    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawObligationCollateral<'info> {
    pub owner: Signer<'info>,
    pub market: Box<Account<'info, Market>>,
    /// CHECK: market PDA
    #[account(seeds = [b"authority", market.key().as_ref()], bump = market.bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(mut, has_one = market, has_one = owner @ KestrelError::Unauthorized)]
    pub obligation: Box<Account<'info, Obligation>>,
    #[account(has_one = market, has_one = collateral_vault)]
    pub reserve: Box<Account<'info, Reserve>>,
    #[account(mut)]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = reserve.collateral_mint)]
    pub user_collateral: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

pub fn withdraw_obligation_collateral(ctx: Context<WithdrawObligationCollateral>, ktokens: u64) -> Result<()> {
    require!(ktokens > 0, KestrelError::ZeroAmount);
    let now = Clock::get()?.unix_timestamp;
    let reserve_key = ctx.accounts.reserve.key();
    {
        let a = &ctx.accounts;
        a.obligation.require_fresh(now)?;
        a.reserve.require_fresh(now)?;
    }
    let o = &mut ctx.accounts.obligation;
    let i = o.deposit_index(&reserve_key).ok_or(KestrelError::ReserveNotInObligation)?;
    let d = o.deposits[i];
    let ktokens = ktokens.min(d.deposited_amount);

    if o.borrow_factor_adjusted_debt_wads > 0 {
        // Value of the withdrawn share of this deposit, and the borrowing power it carries.
        let r = &ctx.accounts.reserve;
        let value = mul_div_down(d.market_value_wads, ktokens as u128, d.deposited_amount as u128)?;
        let ltv = match ctx.accounts.market.elevation_group(o.elevation_group) {
            Some(g) => g.ltv_bps,
            None => r.config.ltv_bps,
        };
        let lost_power = wmul(value, bps(ltv))?;
        require!(lost_power <= o.remaining_borrow_value(), KestrelError::WithdrawTooLarge);
        o.allowed_borrow_value_wads -= lost_power;
    }
    o.deposits[i].deposited_amount -= ktokens;
    o.remove_empty_slots();
    o.last_update_ts = 0;

    let a = &ctx.accounts;
    let mk = a.market.key();
    let seeds: &[&[&[u8]]] = &[&[MARKET_AUTHORITY_SEED, mk.as_ref(), &[a.market.bump]]];
    transfer_signed(&a.token_program, a.collateral_vault.to_account_info(), a.user_collateral.to_account_info(), a.market_authority.to_account_info(), seeds, ktokens)?;
    emit!(CollateralWithdrawn { obligation: a.obligation.key(), reserve: reserve_key, ktokens });
    Ok(())
}

/* ------------------------------ borrow / repay ---------------------------- */

#[derive(Accounts)]
pub struct BorrowObligationLiquidity<'info> {
    pub owner: Signer<'info>,
    pub market: Box<Account<'info, Market>>,
    /// CHECK: market PDA
    #[account(seeds = [b"authority", market.key().as_ref()], bump = market.bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(mut, has_one = market, has_one = owner @ KestrelError::Unauthorized)]
    pub obligation: Box<Account<'info, Obligation>>,
    #[account(mut, has_one = market, has_one = liquidity_vault)]
    pub reserve: Box<Account<'info, Reserve>>,
    #[account(mut)]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = reserve.liquidity_mint)]
    pub user_liquidity: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

pub fn borrow_obligation_liquidity(ctx: Context<BorrowObligationLiquidity>, amount: u64) -> Result<()> {
    require!(amount > 0, KestrelError::ZeroAmount);
    let now = Clock::get()?.unix_timestamp;
    let reserve_key = ctx.accounts.reserve.key();
    {
        let a = &ctx.accounts;
        require!(!a.market.paused, KestrelError::MarketPaused);
        a.obligation.require_fresh(now)?;
        a.reserve.require_fresh(now)?;
        if let Some(g) = a.market.elevation_group(a.obligation.elevation_group) {
            require!(a.reserve.config.elevation_group == g.id, KestrelError::ElevationGroupMismatch);
        }
    }

    let (debt_value, cum_rate) = {
        let r = &ctx.accounts.reserve;
        let value = r.market_value_upper(amount as u128 * WAD)?;
        let bf = if ctx.accounts.obligation.elevation_group != 0 { 10_000 } else { r.config.borrow_factor_bps };
        (wmul_up(value, bps(bf))?, r.cumulative_borrow_rate_wads)
    };

    let o = &mut ctx.accounts.obligation;
    require!(debt_value <= o.remaining_borrow_value(), KestrelError::BorrowTooLarge);
    ctx.accounts.reserve.borrow(amount)?;

    let i = o.find_or_add_borrow(reserve_key, cum_rate)?;
    o.borrows[i].borrowed_amount_wads += amount as u128 * WAD;
    o.borrow_factor_adjusted_debt_wads += debt_value;
    o.last_update_ts = 0;

    let a = &ctx.accounts;
    let mk = a.market.key();
    let seeds: &[&[&[u8]]] = &[&[MARKET_AUTHORITY_SEED, mk.as_ref(), &[a.market.bump]]];
    transfer_signed(&a.token_program, a.liquidity_vault.to_account_info(), a.user_liquidity.to_account_info(), a.market_authority.to_account_info(), seeds, amount)?;
    emit!(Borrowed { obligation: a.obligation.key(), reserve: reserve_key, amount });
    Ok(())
}

#[derive(Accounts)]
pub struct RepayObligationLiquidity<'info> {
    pub payer: Signer<'info>,
    pub market: Box<Account<'info, Market>>,
    #[account(mut, has_one = market)]
    pub obligation: Box<Account<'info, Obligation>>,
    #[account(mut, has_one = market, has_one = liquidity_vault)]
    pub reserve: Box<Account<'info, Reserve>>,
    #[account(mut)]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = reserve.liquidity_mint, token::authority = payer)]
    pub payer_liquidity: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

/// Anyone may repay anyone's debt. `amount = u64::MAX` repays in full.
pub fn repay_obligation_liquidity(ctx: Context<RepayObligationLiquidity>, amount: u64) -> Result<()> {
    require!(amount > 0, KestrelError::ZeroAmount);
    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.reserve.require_fresh(now)?;
    let reserve_key = ctx.accounts.reserve.key();
    let cum = ctx.accounts.reserve.cumulative_borrow_rate_wads;

    let o = &mut ctx.accounts.obligation;
    let i = o.borrow_index(&reserve_key).ok_or(KestrelError::ReserveNotInObligation)?;
    let b = &mut o.borrows[i];
    // Accrue this position to the reserve's index (refresh not required for repay).
    b.borrowed_amount_wads = mul_div_up(b.borrowed_amount_wads, cum, b.cumulative_borrow_rate_wads)?;
    b.cumulative_borrow_rate_wads = cum;

    let full_debt_tokens = to_u64(b.borrowed_amount_wads.div_ceil(WAD))?;
    let pay = amount.min(full_debt_tokens);
    let settle_wads = if pay == full_debt_tokens { b.borrowed_amount_wads } else { pay as u128 * WAD };
    b.borrowed_amount_wads -= settle_wads;
    o.remove_empty_slots();
    o.last_update_ts = 0;

    ctx.accounts.reserve.repay(pay, settle_wads)?;
    let a = &ctx.accounts;
    transfer_user(&a.token_program, a.payer_liquidity.to_account_info(), a.liquidity_vault.to_account_info(), a.payer.to_account_info(), pay)?;
    emit!(Repaid { obligation: a.obligation.key(), reserve: reserve_key, amount: pay });
    Ok(())
}

/* -------------------------------- liquidation ----------------------------- */

#[derive(Accounts)]
pub struct LiquidateObligation<'info> {
    pub liquidator: Signer<'info>,
    pub market: Box<Account<'info, Market>>,
    /// CHECK: market PDA
    #[account(seeds = [b"authority", market.key().as_ref()], bump = market.bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(mut, has_one = market)]
    pub obligation: Box<Account<'info, Obligation>>,
    /// Reserve of the debt being repaid.
    #[account(mut, has_one = market, constraint = repay_reserve.liquidity_vault == repay_liquidity_vault.key())]
    pub repay_reserve: Box<Account<'info, Reserve>>,
    #[account(mut)]
    pub repay_liquidity_vault: Box<Account<'info, TokenAccount>>,
    /// Reserve of the collateral being seized. May equal `repay_reserve`'s market but must be a different account.
    #[account(has_one = market, constraint = withdraw_reserve.collateral_vault == withdraw_collateral_vault.key())]
    pub withdraw_reserve: Box<Account<'info, Reserve>>,
    #[account(mut)]
    pub withdraw_collateral_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = repay_reserve.liquidity_mint, token::authority = liquidator)]
    pub liquidator_liquidity: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = withdraw_reserve.collateral_mint)]
    pub liquidator_collateral: Box<Account<'info, TokenAccount>>,
    /// Required when the seized collateral is a permissioned (RWA) asset.
    #[account(seeds = [b"credential", market.key().as_ref(), liquidator.key().as_ref()], bump)]
    pub credential: Option<Account<'info, Credential>>,
    pub token_program: Program<'info, Token>,
}

/// Repay up to `close_factor` of one borrow and receive the equivalent value of
/// one collateral (as kTokens) plus the liquidation bonus. Requires reserves and
/// obligation refreshed this slot.
pub fn liquidate_obligation(ctx: Context<LiquidateObligation>, max_repay_amount: u64) -> Result<()> {
    require!(max_repay_amount > 0, KestrelError::ZeroAmount);
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    a.obligation.require_fresh(now)?;
    a.repay_reserve.require_fresh(now)?;
    a.withdraw_reserve.require_fresh(now)?;
    require!(a.obligation.is_unhealthy(), KestrelError::ObligationHealthy);
    check_credential(&a.withdraw_reserve, &a.liquidator.key(), a.credential.as_ref(), now)?;

    let repay_key = a.repay_reserve.key();
    let withdraw_key = a.withdraw_reserve.key();
    let bi = a.obligation.borrow_index(&repay_key).ok_or(KestrelError::ReserveNotInObligation)?;
    let di = a.obligation.deposit_index(&withdraw_key).ok_or(KestrelError::ReserveNotInObligation)?;
    let borrow = a.obligation.borrows[bi];
    let deposit = a.obligation.deposits[di];

    // 1. how much debt may be repaid
    let max_by_close_factor = if borrow.market_value_wads <= a.market.dust_debt_wads {
        borrow.borrowed_amount_wads
    } else {
        wmul(borrow.borrowed_amount_wads, bps(a.market.close_factor_bps))?
    };
    let mut repay_wads = max_by_close_factor.min(max_repay_amount as u128 * WAD);

    // 2. collateral owed for it: value(repay) * (1 + bonus), capped at the deposit
    let bonus = bps(a.obligation.liquidation_bonus_bps(&a.market, &a.withdraw_reserve));
    let repay_value = mul_div_down(borrow.market_value_wads, repay_wads, borrow.borrowed_amount_wads)?;
    let seize_value = wmul(repay_value, WAD + bonus)?;
    let mut seize_ktokens = if deposit.market_value_wads == 0 {
        0
    } else {
        to_u64(mul_div_down(deposit.deposited_amount as u128, seize_value, deposit.market_value_wads)?)?
    };
    if seize_ktokens >= deposit.deposited_amount {
        // Not enough collateral: seize all of it and scale the repay down to match.
        seize_ktokens = deposit.deposited_amount;
        let max_value_repayable = wdiv(deposit.market_value_wads, WAD + bonus)?;
        repay_wads = mul_div_down(borrow.borrowed_amount_wads, max_value_repayable, borrow.market_value_wads)?
            .min(repay_wads);
    }
    let repay_amount = to_u64(repay_wads.div_ceil(WAD))?;
    require!(repay_amount > 0 && seize_ktokens > 0, KestrelError::LiquidationTooSmall);

    // 3. state
    let o = &mut ctx.accounts.obligation;
    o.borrows[bi].borrowed_amount_wads -= repay_wads;
    o.deposits[di].deposited_amount -= seize_ktokens;
    o.remove_empty_slots();
    o.last_update_ts = 0;
    ctx.accounts.repay_reserve.repay(repay_amount, repay_wads)?;

    // 4. tokens
    let a = &ctx.accounts;
    transfer_user(&a.token_program, a.liquidator_liquidity.to_account_info(), a.repay_liquidity_vault.to_account_info(), a.liquidator.to_account_info(), repay_amount)?;
    let mk = a.market.key();
    let seeds: &[&[&[u8]]] = &[&[MARKET_AUTHORITY_SEED, mk.as_ref(), &[a.market.bump]]];
    transfer_signed(&a.token_program, a.withdraw_collateral_vault.to_account_info(), a.liquidator_collateral.to_account_info(), a.market_authority.to_account_info(), seeds, seize_ktokens)?;

    emit!(Liquidated {
        obligation: a.obligation.key(),
        liquidator: a.liquidator.key(),
        repay_reserve: repay_key,
        withdraw_reserve: withdraw_key,
        repay_amount,
        seized_ktokens: seize_ktokens,
    });
    Ok(())
}

/* ------------------------------ bad-debt write-off ------------------------ */

#[derive(Accounts)]
pub struct SocializeLoss<'info> {
    pub market: Box<Account<'info, Market>>,
    #[account(mut, has_one = market)]
    pub obligation: Box<Account<'info, Obligation>>,
    #[account(mut, has_one = market)]
    pub reserve: Box<Account<'info, Reserve>>,
}

/// Permissionless once an obligation has no collateral left but still owes:
/// the remaining debt is written off against that reserve's suppliers, so the
/// reserve's books reflect reality instead of carrying phantom assets.
pub fn socialize_loss(ctx: Context<SocializeLoss>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.reserve.require_fresh(now)?;
    let key = ctx.accounts.reserve.key();
    let cum = ctx.accounts.reserve.cumulative_borrow_rate_wads;
    let o = &mut ctx.accounts.obligation;
    require!(!o.has_deposits(), KestrelError::ObligationHasCollateral);
    let i = o.borrow_index(&key).ok_or(KestrelError::ReserveNotInObligation)?;
    let debt = mul_div_up(o.borrows[i].borrowed_amount_wads, cum, o.borrows[i].cumulative_borrow_rate_wads)?;
    o.borrows[i] = ObligationLiquidity::default();
    o.last_update_ts = 0;
    ctx.accounts.reserve.socialize_loss(debt);
    emit!(LossSocialized { obligation: o.key(), reserve: key, debt_wads: debt });
    Ok(())
}

/* ---------------------------------- events -------------------------------- */

#[event]
pub struct LiquidityDeposited { pub reserve: Pubkey, pub user: Pubkey, pub amount: u64, pub ktokens: u64 }
#[event]
pub struct LiquidityRedeemed { pub reserve: Pubkey, pub user: Pubkey, pub amount: u64, pub ktokens: u64 }
#[event]
pub struct CollateralDeposited { pub obligation: Pubkey, pub reserve: Pubkey, pub ktokens: u64 }
#[event]
pub struct CollateralWithdrawn { pub obligation: Pubkey, pub reserve: Pubkey, pub ktokens: u64 }
#[event]
pub struct Borrowed { pub obligation: Pubkey, pub reserve: Pubkey, pub amount: u64 }
#[event]
pub struct Repaid { pub obligation: Pubkey, pub reserve: Pubkey, pub amount: u64 }
#[event]
pub struct Liquidated {
    pub obligation: Pubkey,
    pub liquidator: Pubkey,
    pub repay_reserve: Pubkey,
    pub withdraw_reserve: Pubkey,
    pub repay_amount: u64,
    pub seized_ktokens: u64,
}
#[event]
pub struct LossSocialized { pub obligation: Pubkey, pub reserve: Pubkey, pub debt_wads: u128 }
