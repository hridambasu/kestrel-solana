use anchor_lang::prelude::*;

pub const MAX_ELEVATION_GROUPS: usize = 4;

/// Elevation group ("eMode"): obligations that only hold correlated assets
/// (e.g. SOL + liquid-staked SOL, or USDC + T-bill tokens) get higher LTVs.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug, InitSpace, PartialEq)]
pub struct ElevationGroup {
    /// 0 = unused slot. Group ids are 1..=MAX_ELEVATION_GROUPS.
    pub id: u8,
    pub ltv_bps: u16,
    pub liquidation_threshold_bps: u16,
    pub liquidation_bonus_bps: u16,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub admin: Pubkey,
    /// Issues / revokes credentials for permissioned (RWA) reserves.
    pub compliance_authority: Pubkey,
    /// Max share of a single borrow that can be repaid per liquidation.
    pub close_factor_bps: u16,
    /// Debt below this USD value (WAD) can be fully liquidated in one go.
    pub dust_debt_wads: u128,
    pub paused: bool,
    pub elevation_groups: [ElevationGroup; MAX_ELEVATION_GROUPS],
    pub bump: u8,
}

impl Market {
    pub fn elevation_group(&self, id: u8) -> Option<&ElevationGroup> {
        if id == 0 {
            return None;
        }
        self.elevation_groups.iter().find(|g| g.id == id)
    }
}

/// Proof that `holder` passed KYC/KYB for this market. Required to deposit into,
/// or receive (via liquidation), permissioned reserves such as tokenized
/// T-bills or private credit, whose transfer rules restrict who may hold them.
#[account]
#[derive(InitSpace)]
pub struct Credential {
    pub market: Pubkey,
    pub holder: Pubkey,
    pub expires_at: i64,
    pub revoked: bool,
    pub bump: u8,
}

/// Program-owned price feed for localnet and tests (feature `mock-oracle`).
/// Mirrors the fields the program reads from Pyth `PriceUpdateV2`.
#[account]
#[derive(InitSpace)]
pub struct MockPrice {
    pub authority: Pubkey,
    pub price: i64,
    pub conf: u64,
    pub expo: i32,
    pub ema_price: i64,
    pub publish_time: i64,
}
