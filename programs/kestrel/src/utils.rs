use crate::errors::KestrelError;
use crate::state::{Credential, Reserve};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, MintTo, Token, Transfer};

pub const MARKET_AUTHORITY_SEED: &[u8] = b"authority";
pub const RESERVE_SEED: &[u8] = b"reserve";
pub const LIQUIDITY_VAULT_SEED: &[u8] = b"liquidity";
pub const COLLATERAL_MINT_SEED: &[u8] = b"kmint";
pub const COLLATERAL_VAULT_SEED: &[u8] = b"kvault";
pub const OBLIGATION_SEED: &[u8] = b"obligation";
pub const CREDENTIAL_SEED: &[u8] = b"credential";
pub const VAULT_SEED: &[u8] = b"earn_vault";
pub const VAULT_IDLE_SEED: &[u8] = b"idle";
pub const VAULT_SHARES_SEED: &[u8] = b"shares";
pub const VAULT_KTOKEN_SEED: &[u8] = b"vault_k";

pub fn transfer_user<'info>(
    token_program: &Program<'info, Token>,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    token::transfer(CpiContext::new(token_program.to_account_info(), Transfer { from, to, authority }), amount)
}

pub fn transfer_signed<'info>(
    token_program: &Program<'info, Token>,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    seeds: &[&[&[u8]]],
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    token::transfer(
        CpiContext::new_with_signer(token_program.to_account_info(), Transfer { from, to, authority }, seeds),
        amount,
    )
}

pub fn mint_signed<'info>(
    token_program: &Program<'info, Token>,
    mint: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    seeds: &[&[&[u8]]],
    amount: u64,
) -> Result<()> {
    token::mint_to(CpiContext::new_with_signer(token_program.to_account_info(), MintTo { mint, to, authority }, seeds), amount)
}

pub fn burn_user<'info>(
    token_program: &Program<'info, Token>,
    mint: AccountInfo<'info>,
    from: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    token::burn(CpiContext::new(token_program.to_account_info(), Burn { mint, from, authority }), amount)
}

pub fn burn_signed<'info>(
    token_program: &Program<'info, Token>,
    mint: AccountInfo<'info>,
    from: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    seeds: &[&[&[u8]]],
    amount: u64,
) -> Result<()> {
    token::burn(CpiContext::new_with_signer(token_program.to_account_info(), Burn { mint, from, authority }, seeds), amount)
}

/// Permissioned (RWA) reserves require a live credential for `holder`.
pub fn check_credential(
    reserve: &Reserve,
    holder: &Pubkey,
    credential: Option<&Account<Credential>>,
    now: i64,
) -> Result<()> {
    if !reserve.config.permissioned {
        return Ok(());
    }
    let c = credential.ok_or(KestrelError::CredentialRequired)?;
    require_keys_eq!(c.market, reserve.market, KestrelError::CredentialRequired);
    require_keys_eq!(c.holder, *holder, KestrelError::CredentialRequired);
    require!(!c.revoked && c.expires_at > now, KestrelError::CredentialExpired);
    Ok(())
}

/// Deserialize reserves passed as remaining accounts (read-only) and check they
/// belong to `market`.
pub fn load_reserves(remaining: &[AccountInfo], market: &Pubkey) -> Result<(Vec<Reserve>, Vec<Pubkey>)> {
    let mut reserves = Vec::with_capacity(remaining.len());
    let mut keys = Vec::with_capacity(remaining.len());
    for info in remaining {
        require_keys_eq!(*info.owner, crate::ID, KestrelError::InvalidRemainingAccounts);
        let data = info.try_borrow_data()?;
        let r = Reserve::try_deserialize(&mut &data[..])?;
        require_keys_eq!(r.market, *market, KestrelError::InvalidRemainingAccounts);
        keys.push(info.key());
        reserves.push(r);
    }
    Ok((reserves, keys))
}

/// Same as `load_reserves` but without a market restriction (vaults span markets).
pub fn load_any_reserves(remaining: &[AccountInfo]) -> Result<(Vec<Reserve>, Vec<Pubkey>)> {
    let mut reserves = Vec::with_capacity(remaining.len());
    let mut keys = Vec::with_capacity(remaining.len());
    for info in remaining {
        require_keys_eq!(*info.owner, crate::ID, KestrelError::InvalidRemainingAccounts);
        let data = info.try_borrow_data()?;
        reserves.push(Reserve::try_deserialize(&mut &data[..])?);
        keys.push(info.key());
    }
    Ok((reserves, keys))
}
