use crate::errors::KestrelError;
use crate::math::*;
use crate::state::Reserve;
use anchor_lang::prelude::*;

pub const MAX_ALLOCATIONS: usize = 6;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug, InitSpace, PartialEq)]
pub struct VaultAllocation {
    pub reserve: Pubkey,
    /// Vault-owned token account holding this reserve's kTokens.
    pub ktoken_account: Pubkey,
    /// kTokens held (tracked; donations are ignored).
    pub ktokens: u64,
    /// Max liquidity (base units) the vault may supply to this reserve.
    pub cap: u64,
}

/// Curated earn vault: depositors hold vault shares; the curator whitelists
/// reserves (possibly across markets) and caps each one; the allocator moves
/// idle liquidity in and out. The vault only ever *supplies* — it never borrows.
#[account]
#[derive(InitSpace)]
pub struct EarnVault {
    pub curator: Pubkey,
    pub allocator: Pubkey,
    pub liquidity_mint: Pubkey,
    pub idle_vault: Pubkey,
    pub shares_mint: Pubkey,
    pub fee_receiver: Pubkey,
    pub performance_fee_bps: u16,
    pub idle_amount: u64,
    pub shares_supply: u64,
    /// AUM at the last fee crystallisation (high-water mark for performance fees).
    pub last_aum: u64,
    pub allocations: [VaultAllocation; MAX_ALLOCATIONS],
    #[max_len(32)]
    pub name: String,
    pub bump: u8,
    pub idle_bump: u8,
    pub shares_bump: u8,
}

/// Virtual shares/assets: neutralise first-depositor inflation attacks.
pub const VIRTUAL_SHARES: u128 = 1_000;
pub const VIRTUAL_ASSETS: u128 = 1;

impl EarnVault {
    pub fn allocation_index(&self, reserve: &Pubkey) -> Option<usize> {
        self.allocations.iter().position(|a| a.reserve == *reserve)
    }

    /// AUM = idle + value of each allocation. `reserves` must align with the
    /// non-empty allocations in order and be refreshed this slot.
    pub fn aum(&self, reserves: &[Reserve], keys: &[Pubkey], now: i64) -> Result<u64> {
        let mut total = self.idle_amount as u128;
        for a in self.allocations.iter().filter(|a| a.reserve != Pubkey::default()) {
            if a.ktokens == 0 {
                continue;
            }
            let i = keys.iter().position(|k| *k == a.reserve).ok_or(KestrelError::InvalidRemainingAccounts)?;
            reserves[i].require_fresh(now)?;
            total += reserves[i].collateral_to_liquidity(a.ktokens)? as u128;
        }
        to_u64(total)
    }

    pub fn shares_for_deposit(&self, amount: u64, aum: u64) -> Result<u64> {
        to_u64(mul_div_down(amount as u128, self.shares_supply as u128 + VIRTUAL_SHARES, aum as u128 + VIRTUAL_ASSETS)?)
    }

    pub fn assets_for_shares(&self, shares: u64, aum: u64) -> Result<u64> {
        to_u64(mul_div_down(shares as u128, aum as u128 + VIRTUAL_ASSETS, self.shares_supply as u128 + VIRTUAL_SHARES)?)
    }

    /// Fee shares to mint so the fee receiver owns `fee_bps` of gains above the high-water mark.
    pub fn performance_fee_shares(&self, aum: u64) -> Result<u64> {
        if aum <= self.last_aum || self.performance_fee_bps == 0 {
            return Ok(0);
        }
        let gain = (aum - self.last_aum) as u128;
        let fee_assets = gain * self.performance_fee_bps as u128 / BPS;
        // shares s.t. s / (supply + s) = fee_assets / aum
        let denom = (aum as u128).saturating_sub(fee_assets) + VIRTUAL_ASSETS;
        to_u64(mul_div_down(fee_assets, self.shares_supply as u128 + VIRTUAL_SHARES, denom)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> EarnVault {
        EarnVault {
            curator: Pubkey::default(),
            allocator: Pubkey::default(),
            liquidity_mint: Pubkey::default(),
            idle_vault: Pubkey::default(),
            shares_mint: Pubkey::default(),
            fee_receiver: Pubkey::default(),
            performance_fee_bps: 1000,
            idle_amount: 0,
            shares_supply: 0,
            last_aum: 0,
            allocations: Default::default(),
            name: "test".into(),
            bump: 0,
            idle_bump: 0,
            shares_bump: 0,
        }
    }

    #[test]
    fn performance_fee_takes_share_of_gain() {
        let mut v = vault();
        v.shares_supply = 1_000_000_000;
        v.last_aum = 1_000_000;
        let fee_shares = v.performance_fee_shares(1_100_000).unwrap(); // +100k gain, 10% => 10k
        let fee_value = mul_div_down(fee_shares as u128, 1_100_000, (v.shares_supply + fee_shares) as u128).unwrap();
        assert!((fee_value as i128 - 10_000).abs() <= 2, "fee value {fee_value}");
    }

    #[test]
    fn no_fee_below_high_water_mark() {
        let mut v = vault();
        v.shares_supply = 1_000;
        v.last_aum = 1_000;
        assert_eq!(v.performance_fee_shares(999).unwrap(), 0);
    }

    #[test]
    fn inflation_attack_is_unprofitable() {
        let mut v = vault();
        // attacker deposits 1 unit, then donates 1e9 directly (ignored: idle is tracked)
        let s = v.shares_for_deposit(1, 0).unwrap();
        v.shares_supply += s;
        v.idle_amount += 1;
        let victim = v.shares_for_deposit(1_000_000, v.idle_amount).unwrap();
        assert!(victim > 0);
    }
}
