use crate::errors::KestrelError;
use crate::state::*;
use crate::utils::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

/* ---------------------------------- init ---------------------------------- */

#[derive(Accounts)]
#[instruction(name: String)]
pub struct InitVault<'info> {
    #[account(mut)]
    pub curator: Signer<'info>,
    pub liquidity_mint: Box<Account<'info, Mint>>,
    #[account(
        init, payer = curator, space = 8 + EarnVault::INIT_SPACE,
        seeds = [b"earn_vault", curator.key().as_ref(), name.as_bytes()], bump
    )]
    pub vault: Box<Account<'info, EarnVault>>,
    #[account(
        init, payer = curator, seeds = [b"idle", vault.key().as_ref()], bump,
        token::mint = liquidity_mint, token::authority = vault
    )]
    pub idle_vault: Box<Account<'info, TokenAccount>>,
    /// Share mint has 3 more decimals than the asset, matching VIRTUAL_SHARES = 1_000,
    /// so one whole share starts out worth one whole unit of the asset.
    #[account(
        init, payer = curator, seeds = [b"shares", vault.key().as_ref()], bump,
        mint::decimals = liquidity_mint.decimals + 3, mint::authority = vault
    )]
    pub shares_mint: Box<Account<'info, Mint>>,
    /// Token account (shares mint) receiving performance-fee shares.
    /// CHECK: stored; validated against shares mint whenever fees are minted.
    pub fee_receiver: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn init_vault(ctx: Context<InitVault>, name: String, performance_fee_bps: u16, allocator: Pubkey) -> Result<()> {
    require!(name.len() <= 32, KestrelError::InvalidConfig);
    require!(performance_fee_bps <= 3_000, KestrelError::FeeTooHigh);
    let v = &mut ctx.accounts.vault;
    v.curator = ctx.accounts.curator.key();
    v.allocator = allocator;
    v.liquidity_mint = ctx.accounts.liquidity_mint.key();
    v.idle_vault = ctx.accounts.idle_vault.key();
    v.shares_mint = ctx.accounts.shares_mint.key();
    v.fee_receiver = ctx.accounts.fee_receiver.key();
    v.performance_fee_bps = performance_fee_bps;
    v.idle_amount = 0;
    v.shares_supply = 0;
    v.last_aum = 0;
    v.allocations = Default::default();
    v.name = name;
    v.bump = ctx.bumps.vault;
    v.idle_bump = ctx.bumps.idle_vault;
    v.shares_bump = ctx.bumps.shares_mint;
    Ok(())
}

fn vault_seeds(v: &EarnVault) -> (Pubkey, Vec<u8>, u8) {
    (v.curator, v.name.as_bytes().to_vec(), v.bump)
}

/* ----------------------------- curator: allocations ----------------------- */

#[derive(Accounts)]
pub struct SetAllocation<'info> {
    #[account(mut)]
    pub curator: Signer<'info>,
    #[account(mut, has_one = curator @ KestrelError::Unauthorized)]
    pub vault: Box<Account<'info, EarnVault>>,
    #[account(constraint = reserve.liquidity_mint == vault.liquidity_mint @ KestrelError::MintMismatch)]
    pub reserve: Box<Account<'info, Reserve>>,
    #[account(address = reserve.collateral_mint)]
    pub collateral_mint: Box<Account<'info, Mint>>,
    #[account(
        init_if_needed, payer = curator, seeds = [b"vault_k", vault.key().as_ref(), reserve.key().as_ref()], bump,
        token::mint = collateral_mint, token::authority = vault
    )]
    pub vault_ktokens: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

/// Whitelist a reserve and set its supply cap. A vault never supplies to
/// permissioned reserves (it would need a credential on behalf of every depositor).
/// Setting cap = 0 stops new supply; the allocator then divests.
pub fn set_allocation(ctx: Context<SetAllocation>, cap: u64) -> Result<()> {
    require!(!ctx.accounts.reserve.config.permissioned, KestrelError::CredentialRequired);
    let reserve = ctx.accounts.reserve.key();
    let ktoken_account = ctx.accounts.vault_ktokens.key();
    let v = &mut ctx.accounts.vault;
    let i = match v.allocation_index(&reserve) {
        Some(i) => i,
        None => {
            let i = v.allocation_index(&Pubkey::default()).ok_or(KestrelError::InvalidAllocation)?;
            v.allocations[i] = VaultAllocation { reserve, ktoken_account, ktokens: 0, cap: 0 };
            i
        }
    };
    v.allocations[i].cap = cap;
    emit!(AllocationSet { vault: v.key(), reserve, cap });
    Ok(())
}

/* ------------------------------ user: deposit ----------------------------- */

#[derive(Accounts)]
pub struct VaultDeposit<'info> {
    pub user: Signer<'info>,
    #[account(mut, has_one = idle_vault, has_one = shares_mint)]
    pub vault: Box<Account<'info, EarnVault>>,
    #[account(mut)]
    pub idle_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub shares_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = vault.liquidity_mint, token::authority = user)]
    pub user_liquidity: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = shares_mint)]
    pub user_shares: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = vault.fee_receiver, token::mint = shares_mint)]
    pub fee_receiver: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    // remaining_accounts: every allocated reserve with ktokens > 0 (refreshed this slot).
}

/// Mint performance-fee shares on AUM growth since the last crystallisation.
fn crystallize_fee<'info>(
    vault: &mut Account<'info, EarnVault>,
    aum: u64,
    shares_mint: AccountInfo<'info>,
    fee_receiver: AccountInfo<'info>,
    token_program: &Program<'info, Token>,
) -> Result<()> {
    let fee_shares = vault.performance_fee_shares(aum)?;
    if fee_shares > 0 {
        let (curator, name, bump) = vault_seeds(vault);
        let seeds: &[&[&[u8]]] = &[&[VAULT_SEED, curator.as_ref(), &name, &[bump]]];
        mint_signed(token_program, shares_mint, fee_receiver, vault.to_account_info(), seeds, fee_shares)?;
        vault.shares_supply += fee_shares;
    }
    vault.last_aum = aum;
    Ok(())
}

pub fn vault_deposit<'info>(mut ctx: Context<'_, '_, 'info, 'info, VaultDeposit<'info>>, amount: u64) -> Result<()> {
    require!(amount > 0, KestrelError::ZeroAmount);
    let now = Clock::get()?.unix_timestamp;
    let (reserves, keys) = load_any_reserves(ctx.remaining_accounts)?;
    let aum = ctx.accounts.vault.aum(&reserves, &keys, now)?;

    let a = &mut ctx.accounts;
    crystallize_fee(&mut a.vault, aum, a.shares_mint.to_account_info(), a.fee_receiver.to_account_info(), &a.token_program)?;
    let shares = a.vault.shares_for_deposit(amount, aum)?;
    require!(shares > 0, KestrelError::ZeroAmount);

    transfer_user(&a.token_program, a.user_liquidity.to_account_info(), a.idle_vault.to_account_info(), a.user.to_account_info(), amount)?;
    let (curator, name, bump) = vault_seeds(&a.vault);
    let seeds: &[&[&[u8]]] = &[&[VAULT_SEED, curator.as_ref(), &name, &[bump]]];
    mint_signed(&a.token_program, a.shares_mint.to_account_info(), a.user_shares.to_account_info(), a.vault.to_account_info(), seeds, shares)?;

    let v = &mut a.vault;
    v.idle_amount += amount;
    v.shares_supply += shares;
    v.last_aum = aum + amount;
    emit!(VaultDeposited { vault: v.key(), user: a.user.key(), amount, shares });
    Ok(())
}

/* ------------------------------ user: withdraw ---------------------------- */

#[derive(Accounts)]
pub struct VaultWithdraw<'info> {
    pub user: Signer<'info>,
    #[account(mut, has_one = idle_vault, has_one = shares_mint)]
    pub vault: Box<Account<'info, EarnVault>>,
    #[account(mut)]
    pub idle_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub shares_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = vault.liquidity_mint)]
    pub user_liquidity: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = shares_mint, token::authority = user)]
    pub user_shares: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = vault.fee_receiver, token::mint = shares_mint)]
    pub fee_receiver: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    // remaining_accounts: every allocated reserve with ktokens > 0 (refreshed this slot).
}

/// Burns shares and pays out of idle liquidity. The allocator keeps an idle
/// buffer; for larger exits the allocator bundles a `vault_divest` ahead of this
/// instruction in the same transaction.
pub fn vault_withdraw<'info>(mut ctx: Context<'_, '_, 'info, 'info, VaultWithdraw<'info>>, shares: u64) -> Result<()> {
    require!(shares > 0, KestrelError::ZeroAmount);
    let now = Clock::get()?.unix_timestamp;
    let (reserves, keys) = load_any_reserves(ctx.remaining_accounts)?;
    let aum = ctx.accounts.vault.aum(&reserves, &keys, now)?;

    let a = &mut ctx.accounts;
    crystallize_fee(&mut a.vault, aum, a.shares_mint.to_account_info(), a.fee_receiver.to_account_info(), &a.token_program)?;
    let amount = a.vault.assets_for_shares(shares, aum)?;
    require!(amount > 0, KestrelError::ZeroAmount);
    require!(amount <= a.vault.idle_amount, KestrelError::InsufficientIdle);

    burn_user(&a.token_program, a.shares_mint.to_account_info(), a.user_shares.to_account_info(), a.user.to_account_info(), shares)?;
    let (curator, name, bump) = vault_seeds(&a.vault);
    let seeds: &[&[&[u8]]] = &[&[VAULT_SEED, curator.as_ref(), &name, &[bump]]];
    transfer_signed(&a.token_program, a.idle_vault.to_account_info(), a.user_liquidity.to_account_info(), a.vault.to_account_info(), seeds, amount)?;

    let v = &mut a.vault;
    v.idle_amount -= amount;
    v.shares_supply -= shares;
    v.last_aum = aum - amount;
    emit!(VaultWithdrawn { vault: v.key(), user: a.user.key(), amount, shares });
    Ok(())
}

/* --------------------------- allocator: invest / divest ------------------- */

#[derive(Accounts)]
pub struct VaultMove<'info> {
    pub signer: Signer<'info>,
    #[account(mut, has_one = idle_vault)]
    pub vault: Box<Account<'info, EarnVault>>,
    #[account(mut)]
    pub idle_vault: Box<Account<'info, TokenAccount>>,
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
    #[account(mut, seeds = [b"vault_k", vault.key().as_ref(), reserve.key().as_ref()], bump)]
    pub vault_ktokens: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

/// Supply idle liquidity to an allocated reserve, within its cap.
pub fn vault_invest(ctx: Context<VaultMove>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    require!(a.signer.key() == a.vault.allocator || a.signer.key() == a.vault.curator, KestrelError::Unauthorized);
    require!(!a.market.paused, KestrelError::MarketPaused);
    a.reserve.require_fresh(now)?;
    require!(amount <= a.vault.idle_amount, KestrelError::InsufficientIdle);
    let i = a.vault.allocation_index(&a.reserve.key()).ok_or(KestrelError::InvalidAllocation)?;
    let alloc = a.vault.allocations[i];
    let current = a.reserve.collateral_to_liquidity(alloc.ktokens)?;
    require!(current.saturating_add(amount) <= alloc.cap, KestrelError::AllocationCapExceeded);

    let minted = ctx.accounts.reserve.deposit(amount)?;
    let a = &ctx.accounts;
    let (curator, name, bump) = vault_seeds(&a.vault);
    let vseeds: &[&[&[u8]]] = &[&[VAULT_SEED, curator.as_ref(), &name, &[bump]]];
    transfer_signed(&a.token_program, a.idle_vault.to_account_info(), a.liquidity_vault.to_account_info(), a.vault.to_account_info(), vseeds, amount)?;
    let mk = a.market.key();
    let mseeds: &[&[&[u8]]] = &[&[MARKET_AUTHORITY_SEED, mk.as_ref(), &[a.market.bump]]];
    mint_signed(&a.token_program, a.collateral_mint.to_account_info(), a.vault_ktokens.to_account_info(), a.market_authority.to_account_info(), mseeds, minted)?;

    let v = &mut ctx.accounts.vault;
    v.idle_amount -= amount;
    v.allocations[i].ktokens += minted;
    emit!(VaultReallocated { vault: v.key(), reserve: ctx.accounts.reserve.key(), supplied: amount, withdrawn: 0 });
    Ok(())
}

/// Redeem kTokens from an allocated reserve back to idle. Allowed for the
/// allocator/curator always, and for anyone when the allocation's cap is 0
/// (wind-down) so a removed market can always be exited.
pub fn vault_divest(ctx: Context<VaultMove>, ktokens: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    a.reserve.require_fresh(now)?;
    let i = a.vault.allocation_index(&a.reserve.key()).ok_or(KestrelError::InvalidAllocation)?;
    let privileged = a.signer.key() == a.vault.allocator || a.signer.key() == a.vault.curator;
    require!(privileged || a.vault.allocations[i].cap == 0, KestrelError::Unauthorized);
    let ktokens = ktokens.min(a.vault.allocations[i].ktokens);

    let amount = ctx.accounts.reserve.redeem(ktokens)?;
    let a = &ctx.accounts;
    let (curator, name, bump) = vault_seeds(&a.vault);
    let vseeds: &[&[&[u8]]] = &[&[VAULT_SEED, curator.as_ref(), &name, &[bump]]];
    burn_signed(&a.token_program, a.collateral_mint.to_account_info(), a.vault_ktokens.to_account_info(), a.vault.to_account_info(), vseeds, ktokens)?;
    let mk = a.market.key();
    let mseeds: &[&[&[u8]]] = &[&[MARKET_AUTHORITY_SEED, mk.as_ref(), &[a.market.bump]]];
    transfer_signed(&a.token_program, a.liquidity_vault.to_account_info(), a.idle_vault.to_account_info(), a.market_authority.to_account_info(), mseeds, amount)?;

    let v = &mut ctx.accounts.vault;
    v.idle_amount += amount;
    v.allocations[i].ktokens -= ktokens;
    emit!(VaultReallocated { vault: v.key(), reserve: ctx.accounts.reserve.key(), supplied: 0, withdrawn: amount });
    Ok(())
}

#[event]
pub struct AllocationSet { pub vault: Pubkey, pub reserve: Pubkey, pub cap: u64 }
#[event]
pub struct VaultDeposited { pub vault: Pubkey, pub user: Pubkey, pub amount: u64, pub shares: u64 }
#[event]
pub struct VaultWithdrawn { pub vault: Pubkey, pub user: Pubkey, pub amount: u64, pub shares: u64 }
#[event]
pub struct VaultReallocated { pub vault: Pubkey, pub reserve: Pubkey, pub supplied: u64, pub withdrawn: u64 }
