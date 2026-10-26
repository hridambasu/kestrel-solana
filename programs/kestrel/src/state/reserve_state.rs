use crate::errors::KestrelError;
use crate::math::*;
use crate::oracle::OraclePrice;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq)]
pub struct ReserveConfig {
    /// Max borrow value as share of this collateral's value.
    pub ltv_bps: u16,
    /// Collateral share at which the obligation becomes liquidatable.
    pub liquidation_threshold_bps: u16,
    /// Extra collateral paid to liquidators on repaid debt.
    pub liquidation_bonus_bps: u16,
    /// Risk weight on debt in this asset (10_000 = 1x). Volatile borrow assets
    /// consume more borrowing power per dollar.
    pub borrow_factor_bps: u16,
    /// Share of interest kept by the protocol.
    pub protocol_fee_bps: u16,
    pub min_rate_bps: u16,
    pub optimal_util_bps: u16,
    pub optimal_rate_bps: u16,
    pub max_rate_bps: u16,
    /// Max total liquidity (base units) suppliers can deposit.
    pub deposit_limit: u64,
    /// Max total borrows (base units).
    pub borrow_limit: u64,
    pub borrow_enabled: bool,
    /// RWA mode: depositing and receiving this asset needs a Credential.
    pub permissioned: bool,
    /// 0 = none. Obligations in an elevation group may only use reserves in that group.
    pub elevation_group: u8,
    pub max_price_age_s: u32,
    pub max_conf_bps: u16,
}

impl ReserveConfig {
    pub fn curve(&self) -> RateCurve {
        RateCurve {
            min_rate_bps: self.min_rate_bps,
            optimal_util_bps: self.optimal_util_bps,
            optimal_rate_bps: self.optimal_rate_bps,
            max_rate_bps: self.max_rate_bps,
        }
    }

    pub fn validate(&self) -> Result<()> {
        require!(self.ltv_bps < self.liquidation_threshold_bps || (self.ltv_bps == 0 && self.liquidation_threshold_bps == 0), KestrelError::InvalidConfig);
        require!(self.liquidation_threshold_bps <= 9_800, KestrelError::InvalidConfig);
        // threshold * (1 + bonus) must stay < 100% or liquidations create bad debt by construction
        require!(
            (self.liquidation_threshold_bps as u128) * (10_000 + self.liquidation_bonus_bps as u128) < 10_000 * 10_000,
            KestrelError::InvalidConfig
        );
        require!(self.borrow_factor_bps >= 10_000, KestrelError::InvalidConfig);
        require!(self.protocol_fee_bps <= 5_000, KestrelError::InvalidConfig);
        require!(self.curve().validate(), KestrelError::InvalidConfig);
        require!(self.max_price_age_s > 0, KestrelError::InvalidConfig);
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct Reserve {
    pub market: Pubkey,
    pub liquidity_mint: Pubkey,
    pub liquidity_vault: Pubkey,
    /// kToken: receipt token for supplied liquidity; also what obligations post as collateral.
    pub collateral_mint: Pubkey,
    /// Token account holding kTokens posted as collateral by all obligations.
    pub collateral_vault: Pubkey,
    pub oracle: Pubkey,
    pub decimals: u8,

    /// Liquidity sitting in the vault (tracked, not read from balance: donations can't move the exchange rate).
    pub available_amount: u64,
    pub borrowed_amount_wads: u128,
    pub cumulative_borrow_rate_wads: u128,
    pub accumulated_protocol_fees_wads: u128,
    pub collateral_mint_supply: u64,

    pub price_lower_wads: u128,
    pub price_upper_wads: u128,
    pub last_update_ts: i64,

    pub config: ReserveConfig,
    pub bump: u8,
    pub vault_bump: u8,
    pub collateral_mint_bump: u8,
    pub collateral_vault_bump: u8,
}

impl Reserve {
    pub fn total_liquidity_wads(&self) -> u128 {
        (self.available_amount as u128 * WAD + self.borrowed_amount_wads).saturating_sub(self.accumulated_protocol_fees_wads)
    }

    pub fn utilization_wads(&self) -> Result<u128> {
        let total = self.total_liquidity_wads();
        if total == 0 {
            return Ok(0);
        }
        Ok(wdiv(self.borrowed_amount_wads, total)?.min(WAD))
    }

    pub fn borrow_rate_wads(&self) -> Result<u128> {
        self.config.curve().borrow_rate(self.utilization_wads()?)
    }

    pub fn supply_rate_wads(&self) -> Result<u128> {
        let br = self.borrow_rate_wads()?;
        let gross = wmul(br, self.utilization_wads()?)?;
        wmul(gross, WAD - bps(self.config.protocol_fee_bps))
    }

    /// Accrue interest up to `now` and update cached oracle prices.
    pub fn refresh(&mut self, now: i64, price: Option<OraclePrice>) -> Result<()> {
        let dt = now.saturating_sub(self.last_update_ts).max(0) as u64;
        if dt > 0 {
            let rate = self.borrow_rate_wads()?;
            let factor = compound_factor(rate, dt)?;
            let new_borrowed = wmul_up(self.borrowed_amount_wads, factor)?;
            let interest = new_borrowed - self.borrowed_amount_wads;
            self.accumulated_protocol_fees_wads += wmul(interest, bps(self.config.protocol_fee_bps))?;
            self.borrowed_amount_wads = new_borrowed;
            self.cumulative_borrow_rate_wads = wmul(self.cumulative_borrow_rate_wads, factor)?;
        }
        if let Some(p) = price {
            self.price_lower_wads = p.spot_wads.min(p.ema_wads);
            self.price_upper_wads = p.spot_wads.max(p.ema_wads);
        }
        self.last_update_ts = now;
        Ok(())
    }

    pub fn require_fresh(&self, now: i64) -> Result<()> {
        require!(self.last_update_ts == now && self.price_lower_wads > 0, KestrelError::ReserveStale);
        Ok(())
    }

    /// kTokens minted for a liquidity deposit. 1:1 on the first deposit.
    pub fn liquidity_to_collateral(&self, amount: u64) -> Result<u64> {
        let total = self.total_liquidity_wads();
        if self.collateral_mint_supply == 0 || total == 0 {
            return Ok(amount);
        }
        to_u64(mul_div_down(amount as u128 * WAD, self.collateral_mint_supply as u128, total)?)
    }

    /// Liquidity redeemable for `ktokens`, rounded down.
    pub fn collateral_to_liquidity(&self, ktokens: u64) -> Result<u64> {
        if self.collateral_mint_supply == 0 {
            return Ok(0);
        }
        let wads = mul_div_down(ktokens as u128, self.total_liquidity_wads(), self.collateral_mint_supply as u128)?;
        to_u64(wads / WAD)
    }

    /// Liquidity value (WAD base units) of `ktokens`, for health computations.
    pub fn collateral_to_liquidity_wads(&self, ktokens: u64) -> Result<u128> {
        if self.collateral_mint_supply == 0 {
            return Ok(0);
        }
        mul_div_down(ktokens as u128, self.total_liquidity_wads(), self.collateral_mint_supply as u128)
    }

    pub fn deposit(&mut self, amount: u64) -> Result<u64> {
        require!(amount > 0, KestrelError::ZeroAmount);
        let after = self.total_liquidity_wads() / WAD + amount as u128;
        require!(after <= self.config.deposit_limit as u128, KestrelError::DepositLimitExceeded);
        let minted = self.liquidity_to_collateral(amount)?;
        require!(minted > 0, KestrelError::ZeroAmount);
        self.available_amount = self.available_amount.checked_add(amount).ok_or(KestrelError::MathOverflow)?;
        self.collateral_mint_supply += minted;
        Ok(minted)
    }

    pub fn redeem(&mut self, ktokens: u64) -> Result<u64> {
        require!(ktokens > 0, KestrelError::ZeroAmount);
        let amount = self.collateral_to_liquidity(ktokens)?;
        require!(amount > 0, KestrelError::ZeroAmount);
        require!(amount <= self.available_amount, KestrelError::InsufficientLiquidity);
        self.available_amount -= amount;
        self.collateral_mint_supply -= ktokens;
        Ok(amount)
    }

    pub fn borrow(&mut self, amount: u64) -> Result<()> {
        require!(self.config.borrow_enabled, KestrelError::BorrowDisabled);
        require!(amount <= self.available_amount, KestrelError::InsufficientLiquidity);
        let after = (self.borrowed_amount_wads + amount as u128 * WAD) / WAD;
        require!(after <= self.config.borrow_limit as u128, KestrelError::BorrowLimitExceeded);
        self.available_amount -= amount;
        self.borrowed_amount_wads += amount as u128 * WAD;
        Ok(())
    }

    /// `settle_wads` is the debt being cleared; `amount` the tokens actually paid in (>= settle, rounded up).
    pub fn repay(&mut self, amount: u64, settle_wads: u128) -> Result<()> {
        self.available_amount = self.available_amount.checked_add(amount).ok_or(KestrelError::MathOverflow)?;
        self.borrowed_amount_wads = self.borrowed_amount_wads.saturating_sub(settle_wads);
        Ok(())
    }

    /// Write off unrecoverable debt: suppliers' kTokens are now worth less.
    pub fn socialize_loss(&mut self, debt_wads: u128) {
        self.borrowed_amount_wads = self.borrowed_amount_wads.saturating_sub(debt_wads);
    }

    pub fn market_value_lower(&self, liquidity_wads: u128) -> Result<u128> {
        usd_value(liquidity_wads, self.price_lower_wads, self.decimals)
    }

    pub fn market_value_upper(&self, liquidity_wads: u128) -> Result<u128> {
        usd_value(liquidity_wads, self.price_upper_wads, self.decimals)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    pub fn test_reserve() -> Reserve {
        Reserve {
            market: Pubkey::default(),
            liquidity_mint: Pubkey::default(),
            liquidity_vault: Pubkey::default(),
            collateral_mint: Pubkey::default(),
            collateral_vault: Pubkey::default(),
            oracle: Pubkey::default(),
            decimals: 6,
            available_amount: 0,
            borrowed_amount_wads: 0,
            cumulative_borrow_rate_wads: WAD,
            accumulated_protocol_fees_wads: 0,
            collateral_mint_supply: 0,
            price_lower_wads: WAD,
            price_upper_wads: WAD,
            last_update_ts: 0,
            config: ReserveConfig {
                ltv_bps: 8000,
                liquidation_threshold_bps: 8500,
                liquidation_bonus_bps: 500,
                borrow_factor_bps: 10_000,
                protocol_fee_bps: 1000,
                min_rate_bps: 0,
                optimal_util_bps: 8000,
                optimal_rate_bps: 800,
                max_rate_bps: 10_000,
                deposit_limit: u64::MAX,
                borrow_limit: u64::MAX,
                borrow_enabled: true,
                permissioned: false,
                elevation_group: 0,
                max_price_age_s: 60,
                max_conf_bps: 200,
            },
            bump: 0,
            vault_bump: 0,
            collateral_mint_bump: 0,
            collateral_vault_bump: 0,
        }
    }

    #[test]
    fn interest_accrues_to_suppliers_minus_fee() {
        let mut r = test_reserve();
        let k = r.deposit(1_000_000_000).unwrap(); // 1000 USDC
        r.borrow(800_000_000).unwrap(); // 80% => 8% APR
        r.refresh(SECONDS_PER_YEAR as i64, None).unwrap();

        let debt = r.borrowed_amount_wads as f64 / 1e18 / 1e6;
        assert!((debt - 800.0 * 1.0833).abs() < 0.2, "debt {debt}");
        let supplier = r.collateral_to_liquidity(k).unwrap() as f64 / 1e6;
        let interest = debt - 800.0;
        assert!((supplier - (1000.0 + interest * 0.9)).abs() < 0.01, "supplier {supplier}");
    }

    #[test]
    fn donation_does_not_move_exchange_rate() {
        let mut r = test_reserve();
        r.deposit(1).unwrap();
        // A raw token transfer to the vault doesn't touch `available_amount`.
        let k = r.deposit(1_000_000).unwrap();
        assert_eq!(k, 1_000_000);
    }

    #[test]
    fn deposit_limit_enforced() {
        let mut r = test_reserve();
        r.config.deposit_limit = 100;
        r.deposit(100).unwrap();
        assert!(r.deposit(1).is_err());
    }

    #[test]
    fn borrow_limit_and_liquidity_enforced() {
        let mut r = test_reserve();
        r.deposit(1000).unwrap();
        r.config.borrow_limit = 500;
        assert!(r.borrow(501).is_err());
        r.borrow(500).unwrap();
        r.config.borrow_limit = u64::MAX;
        assert!(r.borrow(501).is_err(), "only 500 available");
    }

    #[test]
    fn config_rejects_bonus_that_guarantees_bad_debt() {
        let mut c = test_reserve().config;
        c.liquidation_threshold_bps = 9500;
        c.liquidation_bonus_bps = 600; // 0.95 * 1.06 > 1
        c.ltv_bps = 9000;
        assert!(c.validate().is_err());
    }

    proptest! {
        /// Deposit then immediately redeem never returns more than deposited.
        #[test]
        fn deposit_redeem_never_profits(
            seed in 1u64..1_000_000_000_000,
            borrow_pct in 0u64..90,
            elapsed in 0i64..10_000_000,
            amount in 1u64..1_000_000_000_000,
        ) {
            let mut r = test_reserve();
            r.deposit(seed).unwrap();
            let b = seed * borrow_pct / 100;
            if b > 0 { r.borrow(b).unwrap(); }
            r.refresh(elapsed, None).unwrap();
            if let Ok(k) = r.deposit(amount) {
                if k > 0 {
                    if let Ok(out) = r.redeem(k) {
                        prop_assert!(out <= amount);
                    }
                }
            }
        }

        /// Total liquidity never decreases from accrual alone.
        #[test]
        fn accrual_never_loses_supplier_value(seed in 1_000u64..1_000_000_000_000, borrow_pct in 0u64..100, dt in 0i64..31_536_000) {
            let mut r = test_reserve();
            r.deposit(seed).unwrap();
            let b = seed * borrow_pct / 100;
            if b > 0 { r.borrow(b).unwrap(); }
            let before = r.total_liquidity_wads();
            r.refresh(dt, None).unwrap();
            prop_assert!(r.total_liquidity_wads() >= before);
        }
    }
}
