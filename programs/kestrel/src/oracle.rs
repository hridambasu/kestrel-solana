//! Price oracle reader.
//!
//! Supports:
//!  * Pyth pull oracle `PriceUpdateV2` accounts (owned by the Pyth receiver
//!    program). Parsed by hand from the documented layout so the program does
//!    not take on the Pyth SDK dependency tree.
//!  * `MockPrice` accounts owned by this program (feature `mock-oracle`) with the
//!    same semantics, for localnet / tests.
//!
//! Both yield a spot price and an EMA price. Reserves store
//!   price_lower = min(spot, ema)  -> used to value collateral
//!   price_upper = max(spot, ema)  -> used to value debt
//! so a single-block price spike (manipulation, bad print) can neither inflate
//! borrowing power nor trigger liquidations as easily.

use crate::errors::KestrelError;
use crate::math::WAD;
use crate::state::MockPrice;
use anchor_lang::prelude::*;
use anchor_lang::Discriminator;

pub const PYTH_RECEIVER_ID: Pubkey = pubkey!("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct OraclePrice {
    pub spot_wads: u128,
    pub ema_wads: u128,
    pub conf_wads: u128,
    pub publish_time: i64,
}

/// Raw Pyth-style price triple -> WAD.
fn scale(price: i64, expo: i32) -> Result<u128> {
    require!(price > 0, KestrelError::InvalidPrice);
    let p = price as u128;
    let v = if expo >= 0 {
        p.checked_mul(10u128.pow(expo as u32))
            .and_then(|x| x.checked_mul(WAD))
    } else {
        let e = (-expo) as u32;
        if e <= 18 {
            p.checked_mul(10u128.pow(18 - e))
        } else {
            Some(p / 10u128.pow(e - 18))
        }
    };
    v.ok_or_else(|| error!(KestrelError::MathOverflow))
}

fn conf_scale(conf: u64, expo: i32) -> Result<u128> {
    if conf == 0 {
        return Ok(0);
    }
    scale(conf as i64, expo)
}

/// Parse a Pyth `PriceUpdateV2` account.
///
/// Layout: 8 discriminator | 32 write_authority | verification_level (1 byte tag,
/// +1 byte if `Partial { num_signatures }`) | PriceFeedMessage { feed_id[32],
/// price i64, conf u64, exponent i32, publish_time i64, prev_publish_time i64,
/// ema_price i64, ema_conf u64 } | posted_slot u64
pub fn parse_pyth_price_update(data: &[u8]) -> Result<OraclePrice> {
    require!(data.len() >= 8 + 32 + 1, KestrelError::InvalidOracle);
    let mut o = 8 + 32;
    let level = data[o];
    o += 1;
    match level {
        0 => o += 1, // Partial { num_signatures: u8 } — reject below
        1 => {}      // Full
        _ => return err!(KestrelError::InvalidOracle),
    }
    // Only accept fully verified updates.
    require!(level == 1, KestrelError::InvalidOracle);
    require!(data.len() >= o + 32 + 8 + 8 + 4 + 8 + 8 + 8 + 8, KestrelError::InvalidOracle);
    o += 32; // feed_id
    let rd_i64 = |o: usize| i64::from_le_bytes(data[o..o + 8].try_into().unwrap());
    let rd_u64 = |o: usize| u64::from_le_bytes(data[o..o + 8].try_into().unwrap());
    let price = rd_i64(o);
    let conf = rd_u64(o + 8);
    let expo = i32::from_le_bytes(data[o + 16..o + 20].try_into().unwrap());
    let publish_time = rd_i64(o + 20);
    let ema_price = rd_i64(o + 36);
    Ok(OraclePrice {
        spot_wads: scale(price, expo)?,
        ema_wads: scale(ema_price, expo)?,
        conf_wads: conf_scale(conf, expo)?,
        publish_time,
    })
}

pub fn read_price(oracle: &AccountInfo, now: i64, max_age_s: u32, max_conf_bps: u16) -> Result<OraclePrice> {
    let data = oracle.try_borrow_data()?;
    let price = if *oracle.owner == PYTH_RECEIVER_ID {
        parse_pyth_price_update(&data)?
    } else if *oracle.owner == crate::ID && cfg!(feature = "mock-oracle") {
        require!(data.len() >= 8 && data[..8] == *MockPrice::DISCRIMINATOR, KestrelError::InvalidOracle);
        let m = MockPrice::try_deserialize(&mut &data[..])?;
        OraclePrice {
            spot_wads: scale(m.price, m.expo)?,
            ema_wads: scale(m.ema_price, m.expo)?,
            conf_wads: conf_scale(m.conf, m.expo)?,
            publish_time: m.publish_time,
        }
    } else {
        return err!(KestrelError::InvalidOracle);
    };

    require!(now.saturating_sub(price.publish_time) <= max_age_s as i64, KestrelError::StalePrice);
    // conf / spot <= max_conf_bps / 10_000
    require!(
        price.conf_wads.saturating_mul(10_000) <= price.spot_wads.saturating_mul(max_conf_bps as u128),
        KestrelError::PriceConfidenceTooWide
    );
    Ok(price)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pyth_bytes(price: i64, conf: u64, expo: i32, publish_time: i64, ema: i64, full: bool) -> Vec<u8> {
        let mut v = vec![0u8; 8];
        v.extend_from_slice(&[7u8; 32]);
        if full {
            v.push(1);
        } else {
            v.push(0);
            v.push(3);
        }
        v.extend_from_slice(&[9u8; 32]);
        v.extend_from_slice(&price.to_le_bytes());
        v.extend_from_slice(&conf.to_le_bytes());
        v.extend_from_slice(&expo.to_le_bytes());
        v.extend_from_slice(&publish_time.to_le_bytes());
        v.extend_from_slice(&(publish_time - 1).to_le_bytes());
        v.extend_from_slice(&ema.to_le_bytes());
        v.extend_from_slice(&conf.to_le_bytes());
        v.extend_from_slice(&123u64.to_le_bytes());
        v
    }

    #[test]
    fn parses_full_pyth_update() {
        let d = pyth_bytes(15_012_345_678, 1_000_000, -8, 1_700_000_000, 14_900_000_000, true);
        let p = parse_pyth_price_update(&d).unwrap();
        assert_eq!(p.spot_wads, 150_123_456_780_000_000_000);
        assert_eq!(p.ema_wads, 149_000_000_000_000_000_000);
        assert_eq!(p.publish_time, 1_700_000_000);
    }

    #[test]
    fn rejects_partial_verification() {
        let d = pyth_bytes(1, 0, -8, 0, 1, false);
        assert!(parse_pyth_price_update(&d).is_err());
    }

    #[test]
    fn scale_handles_exponents() {
        assert_eq!(scale(1, 0).unwrap(), WAD);
        assert_eq!(scale(100_000_000, -8).unwrap(), WAD);
        assert_eq!(scale(1, -20).unwrap(), 0);
        assert!(scale(0, -8).is_err());
        assert!(scale(-5, -8).is_err());
    }
}
