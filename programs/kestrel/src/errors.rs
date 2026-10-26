use anchor_lang::prelude::*;

#[error_code]
pub enum KestrelError {
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Reserve must be refreshed in this transaction")]
    ReserveStale,
    #[msg("Obligation must be refreshed in this transaction")]
    ObligationStale,
    #[msg("Oracle account is not a supported price feed")]
    InvalidOracle,
    #[msg("Oracle account does not match reserve config")]
    OracleMismatch,
    #[msg("Oracle price is stale")]
    StalePrice,
    #[msg("Oracle confidence interval too wide")]
    PriceConfidenceTooWide,
    #[msg("Oracle price is non-positive")]
    InvalidPrice,
    #[msg("Invalid reserve configuration")]
    InvalidConfig,
    #[msg("Deposit would exceed reserve deposit limit")]
    DepositLimitExceeded,
    #[msg("Borrow would exceed reserve borrow limit")]
    BorrowLimitExceeded,
    #[msg("Borrowing is disabled for this reserve")]
    BorrowDisabled,
    #[msg("Not enough liquidity in reserve")]
    InsufficientLiquidity,
    #[msg("Borrow would exceed allowed borrow value")]
    BorrowTooLarge,
    #[msg("Withdraw would leave obligation unhealthy")]
    WithdrawTooLarge,
    #[msg("Obligation is healthy and cannot be liquidated")]
    ObligationHealthy,
    #[msg("Obligation has no free deposit slot")]
    ObligationDepositsFull,
    #[msg("Obligation has no free borrow slot")]
    ObligationBorrowsFull,
    #[msg("Reserve not found in obligation")]
    ReserveNotInObligation,
    #[msg("Remaining accounts do not match obligation reserves")]
    InvalidRemainingAccounts,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Reserve is permissioned: a valid credential is required")]
    CredentialRequired,
    #[msg("Credential has expired")]
    CredentialExpired,
    #[msg("Reserve not allowed in the obligation's elevation group")]
    ElevationGroupMismatch,
    #[msg("Elevation group does not exist")]
    InvalidElevationGroup,
    #[msg("Liquidation repay amount too small")]
    LiquidationTooSmall,
    #[msg("Obligation still has collateral; loss cannot be socialized")]
    ObligationHasCollateral,
    #[msg("Market is paused")]
    MarketPaused,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Vault allocation slot not found or full")]
    InvalidAllocation,
    #[msg("Vault allocation cap exceeded")]
    AllocationCapExceeded,
    #[msg("Vault does not have enough idle liquidity")]
    InsufficientIdle,
    #[msg("Fee too high")]
    FeeTooHigh,
    #[msg("Token mint mismatch")]
    MintMismatch,
}
