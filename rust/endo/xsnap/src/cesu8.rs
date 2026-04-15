//! CESU-8 ↔ UTF-8 codec.
//!
//! XS stores strings internally in CESU-8: supplementary characters
//! (U+10000 and above) are encoded as **two 3-byte sequences** for
//! a UTF-16 surrogate pair, rather than a single 4-byte UTF-8
//! sequence.
//!
//! ```text
//! Character U+1F600 (😀):
//!   UTF-8:  F0 9F 98 80           (4 bytes)
//!   CESU-8: ED A0 BD  ED B8 80   (6 bytes — high + low surrogate)
//! ```
//!
//! Every byte sequence that is valid ASCII or BMP-only UTF-8 is
//! also valid CESU-8.  The difference only matters for codepoints
//! above U+FFFF.

/// Decode a CESU-8 byte slice into a UTF-8 `String`.
///
/// Surrogate pairs (`ED [A0-AF] xx  ED [B0-BF] xx`) are combined
/// into the corresponding supplementary codepoint and re-encoded
/// as a 4-byte UTF-8 sequence.  All other bytes pass through
/// unchanged.
///
/// Returns `Err` if the input contains a lone (unpaired) surrogate
/// or is otherwise malformed.
pub fn decode(bytes: &[u8]) -> Result<String, DecodeError> {
    // Fast path: if the bytes are already valid UTF-8, there are no
    // surrogates to fix (surrogates are invalid in UTF-8).
    if let Ok(s) = std::str::from_utf8(bytes) {
        return Ok(s.to_string());
    }

    // Slow path: scan for surrogate pairs.
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b < 0x80 {
            // ASCII — pass through.
            out.push(b);
            i += 1;
        } else if b < 0xC0 {
            // Unexpected continuation byte.
            return Err(DecodeError);
        } else if b < 0xE0 {
            // 2-byte sequence.
            if i + 1 >= bytes.len() {
                return Err(DecodeError);
            }
            out.push(bytes[i]);
            out.push(bytes[i + 1]);
            i += 2;
        } else if b == 0xED {
            // Possible surrogate.  High surrogates are ED [A0-AF] xx.
            if i + 2 < bytes.len() && bytes[i + 1] >= 0xA0 && bytes[i + 1] <= 0xAF {
                let high = cesu8_three_byte(bytes[i], bytes[i + 1], bytes[i + 2]);
                // Expect a low surrogate immediately after: ED [B0-BF] xx.
                if i + 5 < bytes.len()
                    && bytes[i + 3] == 0xED
                    && bytes[i + 4] >= 0xB0
                    && bytes[i + 4] <= 0xBF
                {
                    let low = cesu8_three_byte(bytes[i + 3], bytes[i + 4], bytes[i + 5]);
                    let cp = 0x10000 + ((high - 0xD800) << 10) + (low - 0xDC00);
                    // Encode as 4-byte UTF-8.
                    out.push(0xF0 | ((cp >> 18) & 0x07) as u8);
                    out.push(0x80 | ((cp >> 12) & 0x3F) as u8);
                    out.push(0x80 | ((cp >> 6) & 0x3F) as u8);
                    out.push(0x80 | (cp & 0x3F) as u8);
                    i += 6;
                } else {
                    // Lone high surrogate.
                    return Err(DecodeError);
                }
            } else if i + 2 < bytes.len() && bytes[i + 1] >= 0xB0 && bytes[i + 1] <= 0xBF {
                // Lone low surrogate (no preceding high surrogate).
                return Err(DecodeError);
            } else {
                // Non-surrogate 3-byte sequence starting with ED.
                if i + 2 >= bytes.len() {
                    return Err(DecodeError);
                }
                out.push(bytes[i]);
                out.push(bytes[i + 1]);
                out.push(bytes[i + 2]);
                i += 3;
            }
        } else if b < 0xF0 {
            // 3-byte sequence (non-ED prefix).
            if i + 2 >= bytes.len() {
                return Err(DecodeError);
            }
            out.push(bytes[i]);
            out.push(bytes[i + 1]);
            out.push(bytes[i + 2]);
            i += 3;
        } else {
            // 4-byte sequence — already UTF-8, pass through.
            // (Shouldn't appear in CESU-8, but handle gracefully.)
            if i + 3 >= bytes.len() {
                return Err(DecodeError);
            }
            out.push(bytes[i]);
            out.push(bytes[i + 1]);
            out.push(bytes[i + 2]);
            out.push(bytes[i + 3]);
            i += 4;
        }
    }
    String::from_utf8(out).map_err(|_| DecodeError)
}

/// Like [`decode`], but replaces malformed sequences with U+FFFD.
pub fn decode_lossy(bytes: &[u8]) -> String {
    if let Ok(s) = std::str::from_utf8(bytes) {
        return s.to_string();
    }
    decode(bytes).unwrap_or_else(|_| String::from_utf8_lossy(bytes).into_owned())
}

/// Encode a UTF-8 string as CESU-8 bytes.
///
/// Supplementary codepoints (4-byte UTF-8 sequences) are split into
/// surrogate pairs, each encoded as a 3-byte CESU-8 sequence.
pub fn encode(s: &str) -> Vec<u8> {
    let bytes = s.as_bytes();
    // Fast path: if no 4-byte sequences, CESU-8 == UTF-8.
    if !bytes.iter().any(|&b| b >= 0xF0) {
        return bytes.to_vec();
    }

    let mut out = Vec::with_capacity(bytes.len() + bytes.len() / 4);
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b < 0xF0 {
            // 1-, 2-, or 3-byte sequence — pass through.
            let n = if b < 0x80 {
                1
            } else if b < 0xE0 {
                2
            } else {
                3
            };
            out.extend_from_slice(&bytes[i..i + n]);
            i += n;
        } else {
            // 4-byte UTF-8 → decode codepoint → split to surrogates.
            let cp = ((b as u32 & 0x07) << 18)
                | ((bytes[i + 1] as u32 & 0x3F) << 12)
                | ((bytes[i + 2] as u32 & 0x3F) << 6)
                | (bytes[i + 3] as u32 & 0x3F);
            let adjusted = cp - 0x10000;
            let high = 0xD800 + (adjusted >> 10);
            let low = 0xDC00 + (adjusted & 0x3FF);
            // Each surrogate as 3-byte CESU-8.
            out.push(0xE0 | ((high >> 12) & 0x0F) as u8);
            out.push(0x80 | ((high >> 6) & 0x3F) as u8);
            out.push(0x80 | (high & 0x3F) as u8);
            out.push(0xE0 | ((low >> 12) & 0x0F) as u8);
            out.push(0x80 | ((low >> 6) & 0x3F) as u8);
            out.push(0x80 | (low & 0x3F) as u8);
            i += 4;
        }
    }
    out
}

/// Decode a 3-byte CESU-8/UTF-8 sequence to a codepoint.
fn cesu8_three_byte(b0: u8, b1: u8, b2: u8) -> u32 {
    ((b0 as u32 & 0x0F) << 12) | ((b1 as u32 & 0x3F) << 6) | (b2 as u32 & 0x3F)
}

/// Error returned when CESU-8 input is malformed (e.g. lone surrogates).
#[derive(Debug, Clone, Copy)]
pub struct DecodeError;

impl std::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "invalid CESU-8")
    }
}

impl std::error::Error for DecodeError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ascii_round_trip() {
        let s = "hello world";
        let cesu = encode(s);
        assert_eq!(cesu, s.as_bytes());
        assert_eq!(decode(&cesu).unwrap(), s);
    }

    #[test]
    fn bmp_round_trip() {
        // U+00E9 (é) — 2-byte UTF-8, same in CESU-8.
        // U+4E16 (世) — 3-byte UTF-8, same in CESU-8.
        let s = "café 世界";
        let cesu = encode(s);
        assert_eq!(cesu, s.as_bytes());
        assert_eq!(decode(&cesu).unwrap(), s);
    }

    #[test]
    fn supplementary_encode() {
        // U+1F600 (😀) — 4-byte UTF-8 → 6-byte CESU-8.
        let s = "😀";
        let cesu = encode(s);
        assert_eq!(cesu.len(), 6, "CESU-8 should be 6 bytes for U+1F600");
        // High surrogate D83D: ED A0 BD
        assert_eq!(cesu[0], 0xED);
        assert_eq!(cesu[1], 0xA0);
        assert_eq!(cesu[2], 0xBD);
        // Low surrogate DE00: ED B8 80
        assert_eq!(cesu[3], 0xED);
        assert_eq!(cesu[4], 0xB8);
        assert_eq!(cesu[5], 0x80);
    }

    #[test]
    fn supplementary_decode() {
        // ED A0 BD  ED B8 80 → U+1F600 → F0 9F 98 80.
        let cesu = vec![0xED, 0xA0, 0xBD, 0xED, 0xB8, 0x80];
        let s = decode(&cesu).unwrap();
        assert_eq!(s, "😀");
    }

    #[test]
    fn mixed_round_trip() {
        let s = "hello 😀 world 🌍!";
        let cesu = encode(s);
        assert_ne!(cesu, s.as_bytes(), "CESU-8 should differ for emoji");
        let decoded = decode(&cesu).unwrap();
        assert_eq!(decoded, s);
    }

    #[test]
    fn lone_surrogate_is_error() {
        // High surrogate without a low surrogate.
        let cesu = vec![0xED, 0xA0, 0xBD, b'x'];
        assert!(decode(&cesu).is_err());
    }

    #[test]
    fn lossy_on_error() {
        let cesu = vec![0xED, 0xA0, 0xBD, b'x'];
        let s = decode_lossy(&cesu);
        // Should not panic; content is best-effort.
        assert!(!s.is_empty());
    }
}
