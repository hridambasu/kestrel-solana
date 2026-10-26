use crate::errors::KestrelError;
use crate::math::*;
use crate::state::{Market, Reserve};
use anchor_lang::prelude::*;

pub const MAX_DEPOSITS: usize = 4;
pub const MAX_BORROWS: usize = 4;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug, InitSpace, PartialEq)]
pub struct ObligationCollateral {
    pub reserve: Pubkey,
    /// kTokens posted.
    pub deposited_amount: u64,
    pub market_value_wads: u128,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug, InitSpace, PartialEq)]
pub struct ObligationLiquidity {
    pub reserve: Pubkey,
    /// Debt in liquidity base units * WAD, as of `cumulative_borrow_rate_wads`.
    pub borrowed_amount_wads: u128,
    pub cumulative_borrow_rate_wads: u128,
    pub market_value_wads: u128,
}

/// A user's cross-collateral account in one market.
#[account]
#[derive(InitSpace)]
pub struct Obligation {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub elevation_group: u8,
    pub deposits: [ObligationCollateral; MAX_DEPOSITS],
    pub borrows: [ObligationLiquidity; MAX_BORROWS],
    /// Sum of collateral values at price_lower.
    pub deposited_value_wads: u128,
    /// Sum of debt values at price_upper, times borrow factor.
    pub borrow_factor_adjusted_debt_wads: u128,
    pub allowed_borrow_value_wads: u128,
    pub unhealthy_borrow_value_wads: u128,
    pub last_update_ts: i64,
    pub bump: u8,
}

impl Obligation {
    pub fn require_fresh(&self, now: i64) -> Result<()> {
        require!(self.last_update_ts == now, KestrelError::ObligationStale);
        Ok(())
    }

    pub fn active_reserves(&self) -> Vec<Pubkey> {
        self.deposits
            .iter()
            .filter(|d| d.reserve != Pubkey::default())
            .map(|d| d.reserve)
            .chain(self.borrows.iter().filter(|b| b.reserve != Pubkey::default()).map(|b| b.reserve))
            .collect()
    }

    pub fn deposit_index(&self, reserve: &Pubkey) -> Option<usize> {
        self.deposits.iter().position(|d| d.reserve == *reserve)
    }

    pub fn borrow_index(&self, reserve: &Pubkey) -> Option<usize> {
        self.borrows.iter().position(|b| b.reserve == *reserve)
    }

    pub fn find_or_add_deposit(&mut self, reserve: Pubkey) -> Result<usize> {
        if let Some(i) = self.deposit_index(&reserve) {
            return Ok(i);
        }
        let i = self
            .deposits
            .iter()
            .position(|d| d.reserve == Pubkey::default())
            .ok_or(KestrelError::ObligationDepositsFull)?;
        self.deposits[i] = ObligationCollateral { reserve, ..Default::default() };
        Ok(i)
    }

    pub fn find_or_add_borrow(&mut self, reserve: Pubkey, cumulative_rate: u128) -> Result<usize> {
        if let Some(i) = self.borrow_index(&reserve) {
            return Ok(i);
        }
        let i = self
            .borrows
            .iter()
            .position(|b| b.reserve == Pubkey::default())
            .ok_or(KestrelError::ObligationBorrowsFull)?;
        self.borrows[i] = ObligationLiquidity { reserve, cumulative_borrow_rate_wads: cumulative_rate, ..Default::default() };
        Ok(i)
    }

    pub fn remove_empty_slots(&mut self) {
        for d in self.deposits.iter_mut() {
            if d.reserve != Pubkey::default() && d.deposited_amount == 0 {
                *d = ObligationCollateral::default();
            }
        }
        for b in self.borrows.iter_mut() {
            // Dust below 1 base unit is cleared together with the slot.
            if b.reserve != Pubkey::default() && b.borrowed_amount_wads < WAD {
                *b = ObligationLiquidity::default();
            }
        }
    }

    pub fn has_deposits(&self) -> bool {
        self.deposits.iter().any(|d| d.reserve != Pubkey::default() && d.deposited_amount > 0)
    }

    pub fn is_unhealthy(&self) -> bool {
        self.borrow_factor_adjusted_debt_wads > self.unhealthy_borrow_value_wads
    }

    /// Remaining borrowing power (USD WAD).
    pub fn remaining_borrow_value(&self) -> u128 {
        self.allowed_borrow_value_wads.saturating_sub(self.borrow_factor_adjusted_debt_wads)
    }

    /// Health factor as WAD (u128::MAX when no debt).
    pub fn health_factor_wads(&self) -> u128 {
        if self.borrow_factor_adjusted_debt_wads == 0 {
            return u128::MAX;
        }
        wdiv(self.unhealthy_borrow_value_wads, self.borrow_factor_adjusted_debt_wads).unwrap_or(u128::MAX)
    }

    /// Recompute all values from fresh reserves. `reserves` must be in the order
    /// returned by `active_reserves()`.
    pub fn refresh(&mut self, market: &Market, reserves: &[Reserve], keys: &[Pubkey], now: i64) -> Result<()> {
        let group = market.elevation_group(self.elevation_group).copied();
        let lookup = |key: &Pubkey| -> Result<&Reserve> {
            let i = keys.iter().position(|k| k == key).ok_or(KestrelError::InvalidRemainingAccounts)?;
            let r = &reserves[i];
            r.require_fresh(now)?;
            Ok(r)
        };

        let mut deposited = 0u128;
        let mut allowed = 0u128;
        let mut unhealthy = 0u128;
        for d in self.deposits.iter_mut().filter(|d| d.reserve != Pubkey::default()) {
            let r = lookup(&d.reserve)?;
            let liq = r.collateral_to_liquidity_wads(d.deposited_amount)?;
            let value = r.market_value_lower(liq)?;
            d.market_value_wads = value;
            let (ltv, liq_threshold) = match group {
                Some(g) => {
                    require!(r.config.elevation_group == g.id, KestrelError::ElevationGroupMismatch);
                    (g.ltv_bps, g.liquidation_threshold_bps)
                }
                None => (r.config.ltv_bps, r.config.liquidation_threshold_bps),
            };
            deposited += value;
            allowed += wmul(value, bps(ltv))?;
            unhealthy += wmul(value, bps(liq_threshold))?;
        }

        let mut debt = 0u128;
        for b in self.borrows.iter_mut().filter(|b| b.reserve != Pubkey::default()) {
            let r = lookup(&b.reserve)?;
            // Bring debt up to the reserve's current cumulative rate.
            if b.cumulative_borrow_rate_wads != r.cumulative_borrow_rate_wads {
                b.borrowed_amount_wads =
                    mul_div_up(b.borrowed_amount_wads, r.cumulative_borrow_rate_wads, b.cumulative_borrow_rate_wads)?;
                b.cumulative_borrow_rate_wads = r.cumulative_borrow_rate_wads;
            }
            let value = r.market_value_upper(b.borrowed_amount_wads)?;
            b.market_value_wads = value;
            // In an elevation group, correlated debt is weighted 1x.
            let bf = if group.is_some() {
                require!(r.config.elevation_group == self.elevation_group, KestrelError::ElevationGroupMismatch);
                10_000
            } else {
                r.config.borrow_factor_bps
            };
            debt += wmul_up(value, bps(bf))?;
        }

        self.deposited_value_wads = deposited;
        self.allowed_borrow_value_wads = allowed;
        self.unhealthy_borrow_value_wads = unhealthy;
        self.borrow_factor_adjusted_debt_wads = debt;
        self.last_update_ts = now;
        Ok(())
    }

    /// Liquidation bonus that applies to collateral in `reserve`.
    pub fn liquidation_bonus_bps(&self, market: &Market, reserve: &Reserve) -> u16 {
        match market.elevation_group(self.elevation_group) {
            Some(g) => g.liquidation_bonus_bps,
            None => reserve.config.liquidation_bonus_bps,
        }
    }
}
