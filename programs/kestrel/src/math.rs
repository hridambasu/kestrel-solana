//! Fixed-point math. All `*_wads` values are u128 scaled by 1e18.
//! Rounding is always chosen in the protocol's favour: debt rounds up,
//! claims on assets round down.

use crate::errors::KestrelError;
use anchor_lang::prelude::*;

pub const WAD: u128 = 1_000_000_000_000_000_000;
pub const BPS: u128 = 10_000;
pub const SECONDS_PER_YEAR: u128 = 365 * 24 * 3600;

mod wide {
    // Isolated from anchor's prelude: the macro expands to code using std `Result`.
    uint::construct_uint! {
        /// 256-bit intermediate so `a * b / d` never overflows when the result fits in u128.
        pub struct U256(4);
    }
}
use wide::U256;

pub fn mul_div_down(a: u128, b: u128, d: u128) -> Result<u128> {
    require!(d != 0, KestrelError::MathOverflow);
    let r = U256::from(a) * U256::from(b) / U256::from(d);
    require!(r <= U256::from(u128::MAX), KestrelError::MathOverflow);
    Ok(r.as_u128())
}

pub fn mul_div_up(a: u128, b: u128, d: u128) -> Result<u128> {
    require!(d != 0, KestrelError::MathOverflow);
    let p = U256::from(a) * U256::from(b);
    let dd = U256::from(d);
    let mut r = p / dd;
    if !(p % dd).is_zero() {
        r += U256::one();
    }
    require!(r <= U256::from(u128::MAX), KestrelError::MathOverflow);
    Ok(r.as_u128())
}

pub fn wmul(a: u128, b: u128) -> Result<u128> {
    mul_div_down(a, b, WAD)
}

pub fn wmul_up(a: u128, b: u128) -> Result<u128> {
    mul_div_up(a, b, WAD)
}

pub fn wdiv(a: u128, b: u128) -> Result<u128> {
    mul_div_down(a, WAD, b)
}

pub fn bps(x: u16) -> u128 {
    x as u128 * WAD / BPS
}

/// Kinked interest-rate curve.
///
/// ```text
///   rate
///    |                          /  max
///    |                        /
///    |               ______/  optimal
///    |        ______/
///    | ______/ min
///    +--------------|-------------> utilization
///                optimal
/// ```
#[derive(Clone, Copy, Debug)]
pub struct RateCurve {
    pub min_rate_bps: u16,
    pub optimal_util_bps: u16,
    pub optimal_rate_bps: u16,
    pub max_rate_bps: u16,
}

impl RateCurve {
    /// Annual borrow rate (WAD) at a given utilization (WAD).
    pub fn borrow_rate(&self, util: u128) -> Result<u128> {
        let opt_u = bps(self.optimal_util_bps);
        let min_r = bps(self.min_rate_bps);
        let opt_r = bps(self.optimal_rate_bps);
        let max_r = bps(self.max_rate_bps);
        let util = util.min(WAD);
        if util <= opt_u || opt_u == WAD {
            if opt_u == 0 {
                return Ok(opt_r);
            }
            Ok(min_r + mul_div_down(util, opt_r - min_r, opt_u)?)
        } else {
            Ok(opt_r + mul_div_down(util - opt_u, max_r - opt_r, WAD - opt_u)?)
        }
    }

    pub fn validate(&self) -> bool {
        self.optimal_util_bps <= 10_000
            && self.min_rate_bps <= self.optimal_rate_bps
            && self.optimal_rate_bps <= self.max_rate_bps
    }
}

/// Growth factor (WAD) for continuously compounding an annual rate over `dt`
/// seconds: e^(r*t) via a 3rd-order Taylor expansion on x = r*t. Expanding on the
/// total exponent (rather than squaring a tiny per-second rate) keeps full WAD
/// precision; the truncated series slightly underestimates, never overcharges.
pub fn compound_factor(annual_rate: u128, dt: u64) -> Result<u128> {
    if dt == 0 || annual_rate == 0 {
        return Ok(WAD);
    }
    let x = mul_div_down(annual_rate, dt as u128, SECONDS_PER_YEAR)?;
    let second = mul_div_down(x, x, 2 * WAD)?;
    let third = mul_div_down(second, x, 3 * WAD)?;
    Ok(WAD + x + second + third)
}

pub fn to_u64(x: u128) -> Result<u64> {
    u64::try_from(x).map_err(|_| error!(KestrelError::MathOverflow))
}

/// USD value (WAD) of `amount` base units of a token with `decimals` at `price` (WAD USD per whole token).
pub fn usd_value(amount_wads: u128, price: u128, decimals: u8) -> Result<u128> {
    // amount_wads is base units * WAD
    mul_div_down(wmul(amount_wads, price)?, 1, 10u128.pow(decimals as u32))
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn curve_kink() {
        let c = RateCurve { min_rate_bps: 0, optimal_util_bps: 8000, optimal_rate_bps: 800, max_rate_bps: 10_000 };
        assert_eq!(c.borrow_rate(0).unwrap(), 0);
        assert_eq!(c.borrow_rate(bps(4000)).unwrap(), bps(400));
        assert_eq!(c.borrow_rate(bps(8000)).unwrap(), bps(800));
        assert_eq!(c.borrow_rate(bps(9000)).unwrap(), bps(800) + (bps(10_000) - bps(800)) / 2);
        assert_eq!(c.borrow_rate(WAD).unwrap(), bps(10_000));
        assert_eq!(c.borrow_rate(2 * WAD).unwrap(), bps(10_000), "clamped above 100%");
    }

    #[test]
    fn compound_one_year_at_10pct() {
        let f = compound_factor(bps(1000), SECONDS_PER_YEAR as u64).unwrap();
        // e^0.1 = 1.10517; 3rd-order expansion of (1+r/Y)^Y slightly under-estimates
        let got = f as f64 / 1e18;
        assert!((got - 1.10517).abs() < 0.0002, "got {got}");
        assert!(got <= 1.10518);
    }

    #[test]
    fn mul_div_handles_large_products() {
        let a = u128::MAX / 3;
        assert_eq!(mul_div_down(a, 6, 3).unwrap(), a * 2);
    }

    proptest! {
        #[test]
        fn rate_monotonic(u1 in 0u128..=WAD, u2 in 0u128..=WAD) {
            let c = RateCurve { min_rate_bps: 50, optimal_util_bps: 8500, optimal_rate_bps: 900, max_rate_bps: 25_000 };
            let (lo, hi) = if u1 <= u2 { (u1, u2) } else { (u2, u1) };
            prop_assert!(c.borrow_rate(lo).unwrap() <= c.borrow_rate(hi).unwrap());
        }

        #[test]
        fn compound_monotonic_in_time(rate in 0u128..(5 * WAD), dt1 in 0u64..864_000, extra in 0u64..864_000) {
            let a = compound_factor(rate, dt1).unwrap();
            let b = compound_factor(rate, dt1 + extra).unwrap();
            prop_assert!(a <= b);
            prop_assert!(a >= WAD);
        }

        #[test]
        fn mul_div_up_ge_down(a in 0u128..u64::MAX as u128, b in 0u128..u64::MAX as u128, d in 1u128..u64::MAX as u128) {
            let lo = mul_div_down(a, b, d).unwrap();
            let hi = mul_div_up(a, b, d).unwrap();
            prop_assert!(hi == lo || hi == lo + 1);
        }
    }
}
