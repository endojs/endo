//! CBOR envelope protocol for worker ↔ supervisor communication.
//!
//! Envelopes are 4-element CBOR arrays: [handle, verb, payload, nonce].
//! Frames are CBOR byte-string wrappers around serialized envelopes.
//!
//! This is a self-contained copy of the codec from `rust/endo/src/codec.rs`,
//! without tokio async dependencies. The xsnap worker runs a synchronous
//! event loop (XS is single-threaded), so async I/O is not needed.

use std::io::{self, Read, Write};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Worker/daemon handle identifier.
pub type Handle = i64;

/// An envelope on the wire.
#[derive(Debug, Clone)]
pub struct Envelope {
    pub handle: Handle,
    pub verb: String,
    pub payload: Vec<u8>,
    pub nonce: i64,
}

// ---------------------------------------------------------------------------
// CBOR encoding helpers
// ---------------------------------------------------------------------------

const CBOR_UINT: u8 = 0;
const CBOR_NEGINT: u8 = 1;
const CBOR_BYTES: u8 = 2;
const CBOR_TEXT: u8 = 3;
const CBOR_ARRAY: u8 = 4;

fn cbor_append_head(buf: &mut Vec<u8>, major: u8, n: u64) {
    let m = major << 5;
    if n < 24 {
        buf.push(m | n as u8);
    } else if n <= 0xff {
        buf.push(m | 24);
        buf.push(n as u8);
    } else if n <= 0xffff {
        buf.push(m | 25);
        buf.extend_from_slice(&(n as u16).to_be_bytes());
    } else if n <= 0xffff_ffff {
        buf.push(m | 26);
        buf.extend_from_slice(&(n as u32).to_be_bytes());
    } else {
        buf.push(m | 27);
        buf.extend_from_slice(&n.to_be_bytes());
    }
}

fn cbor_append_int(buf: &mut Vec<u8>, n: i64) {
    if n >= 0 {
        cbor_append_head(buf, CBOR_UINT, n as u64);
    } else {
        cbor_append_head(buf, CBOR_NEGINT, (-1 - n) as u64);
    }
}

fn cbor_append_bytes(buf: &mut Vec<u8>, data: &[u8]) {
    cbor_append_head(buf, CBOR_BYTES, data.len() as u64);
    buf.extend_from_slice(data);
}

fn cbor_append_text(buf: &mut Vec<u8>, s: &str) {
    cbor_append_head(buf, CBOR_TEXT, s.len() as u64);
    buf.extend_from_slice(s.as_bytes());
}

// ---------------------------------------------------------------------------
// CBOR decoding helpers
// ---------------------------------------------------------------------------

struct Cursor<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Cursor<'a> {
    fn new(data: &'a [u8]) -> Self {
        Cursor { data, pos: 0 }
    }

    fn read_head(&mut self) -> io::Result<(u8, u64)> {
        if self.pos >= self.data.len() {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "CBOR: unexpected end of input",
            ));
        }
        let initial = self.data[self.pos];
        self.pos += 1;
        let major = initial >> 5;
        let info = initial & 0x1f;
        if info < 24 {
            return Ok((major, info as u64));
        }
        let size = match info {
            24 => 1,
            25 => 2,
            26 => 4,
            27 => 8,
            _ => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("CBOR: unsupported info {info}"),
                ))
            }
        };
        if self.pos + size > self.data.len() {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "CBOR: truncated head",
            ));
        }
        let mut value: u64 = 0;
        for i in 0..size {
            value = (value << 8) | self.data[self.pos + i] as u64;
        }
        self.pos += size;
        Ok((major, value))
    }

    fn read_int(&mut self) -> io::Result<i64> {
        let (major, value) = self.read_head()?;
        match major {
            0 => Ok(value as i64),
            1 => Ok(-(value as i64) - 1),
            _ => Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("CBOR: expected int, got major {major}"),
            )),
        }
    }

    fn read_bytes(&mut self) -> io::Result<Vec<u8>> {
        let (major, len) = self.read_head()?;
        if major != CBOR_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("CBOR: expected bytes, got major {major}"),
            ));
        }
        let len = len as usize;
        if self.pos + len > self.data.len() {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "CBOR: truncated bytes",
            ));
        }
        let result = self.data[self.pos..self.pos + len].to_vec();
        self.pos += len;
        Ok(result)
    }

    fn read_text(&mut self) -> io::Result<String> {
        let (major, len) = self.read_head()?;
        if major != CBOR_TEXT {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("CBOR: expected text, got major {major}"),
            ));
        }
        let len = len as usize;
        if self.pos + len > self.data.len() {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "CBOR: truncated text",
            ));
        }
        let s = std::str::from_utf8(&self.data[self.pos..self.pos + len])
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        self.pos += len;
        Ok(s.to_string())
    }

    fn read_array_header(&mut self) -> io::Result<u64> {
        let (major, len) = self.read_head()?;
        if major != CBOR_ARRAY {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("CBOR: expected array, got major {major}"),
            ));
        }
        Ok(len)
    }
}

// ---------------------------------------------------------------------------
// Frame I/O
// ---------------------------------------------------------------------------

const MAX_FRAME_SIZE: usize = 16 * 1024 * 1024; // 16 MiB

/// Read one CBOR byte-string frame. Returns None on EOF.
pub fn read_frame(r: &mut impl Read) -> io::Result<Option<Vec<u8>>> {
    let mut first = [0u8; 1];
    match r.read_exact(&mut first) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let major = first[0] >> 5;
    if major != CBOR_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("frame: expected bytes major 2, got {major}"),
        ));
    }
    let info = first[0] & 0x1f;
    let len: usize = if info < 24 {
        info as usize
    } else if info == 24 {
        let mut b = [0u8; 1];
        r.read_exact(&mut b)?;
        b[0] as usize
    } else if info == 25 {
        let mut b = [0u8; 2];
        r.read_exact(&mut b)?;
        ((b[0] as usize) << 8) | b[1] as usize
    } else if info == 26 {
        let mut b = [0u8; 4];
        r.read_exact(&mut b)?;
        ((b[0] as usize) << 24)
            | ((b[1] as usize) << 16)
            | ((b[2] as usize) << 8)
            | b[3] as usize
    } else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("frame: unsupported length info {info}"),
        ));
    };
    if len > MAX_FRAME_SIZE {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("frame: size {len} exceeds maximum {MAX_FRAME_SIZE}"),
        ));
    }
    let mut buf = vec![0u8; len];
    if len > 0 {
        r.read_exact(&mut buf)?;
    }
    Ok(Some(buf))
}

/// Write a CBOR byte-string frame.
pub fn write_frame(w: &mut impl Write, data: &[u8]) -> io::Result<()> {
    let mut header = Vec::new();
    cbor_append_head(&mut header, CBOR_BYTES, data.len() as u64);
    w.write_all(&header)?;
    w.write_all(data)?;
    w.flush()
}

// ---------------------------------------------------------------------------
// Envelope encoding/decoding
// ---------------------------------------------------------------------------

/// Encode an envelope as a CBOR 4-element array.
pub fn encode_envelope(env: &Envelope) -> Vec<u8> {
    let mut buf = Vec::new();
    cbor_append_head(&mut buf, CBOR_ARRAY, 4);
    cbor_append_int(&mut buf, env.handle);
    cbor_append_text(&mut buf, &env.verb);
    cbor_append_bytes(&mut buf, &env.payload);
    cbor_append_int(&mut buf, env.nonce);
    buf
}

/// Decode an envelope from a CBOR 3- or 4-element array.
pub fn decode_envelope(data: &[u8]) -> io::Result<Envelope> {
    let mut c = Cursor::new(data);
    let n = c.read_array_header()?;
    if n != 3 && n != 4 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("envelope: expected 3 or 4 elements, got {n}"),
        ));
    }
    let handle = c.read_int()?;
    let verb = c.read_text()?;
    let payload = c.read_bytes()?;
    let nonce = if n == 4 { c.read_int()? } else { 0 };
    Ok(Envelope {
        handle,
        verb,
        payload,
        nonce,
    })
}

// ---------------------------------------------------------------------------
// Convenience: read/write envelope as a framed message
// ---------------------------------------------------------------------------

/// Read one envelope from a framed stream. Returns None on EOF.
pub fn read_envelope(r: &mut impl Read) -> io::Result<Option<Envelope>> {
    match read_frame(r)? {
        Some(data) => Ok(Some(decode_envelope(&data)?)),
        None => Ok(None),
    }
}

/// Write one envelope as a framed message.
pub fn write_envelope(w: &mut impl Write, env: &Envelope) -> io::Result<()> {
    let data = encode_envelope(env);
    write_frame(w, &data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_envelope() {
        let env = Envelope {
            handle: 42,
            verb: "deliver".to_string(),
            payload: b"hello".to_vec(),
            nonce: 7,
        };
        let encoded = encode_envelope(&env);
        let decoded = decode_envelope(&encoded).unwrap();
        assert_eq!(decoded.handle, 42);
        assert_eq!(decoded.verb, "deliver");
        assert_eq!(decoded.payload, b"hello");
        assert_eq!(decoded.nonce, 7);
    }

    #[test]
    fn round_trip_frame() {
        let data = b"test payload";
        let mut buf = Vec::new();
        write_frame(&mut buf, data).unwrap();

        let mut cursor = io::Cursor::new(&buf);
        let read_back = read_frame(&mut cursor).unwrap().unwrap();
        assert_eq!(read_back, data);
    }

    #[test]
    fn round_trip_framed_envelope() {
        let env = Envelope {
            handle: 1,
            verb: "init".to_string(),
            payload: vec![],
            nonce: 0,
        };
        let mut buf = Vec::new();
        write_envelope(&mut buf, &env).unwrap();

        let mut cursor = io::Cursor::new(&buf);
        let decoded = read_envelope(&mut cursor).unwrap().unwrap();
        assert_eq!(decoded.handle, 1);
        assert_eq!(decoded.verb, "init");
        assert!(decoded.payload.is_empty());
    }

    #[test]
    fn negative_handle() {
        let env = Envelope {
            handle: -1,
            verb: "error".to_string(),
            payload: b"oops".to_vec(),
            nonce: -5,
        };
        let encoded = encode_envelope(&env);
        let decoded = decode_envelope(&encoded).unwrap();
        assert_eq!(decoded.handle, -1);
        assert_eq!(decoded.nonce, -5);
    }

    #[test]
    fn eof_returns_none() {
        let buf: Vec<u8> = vec![];
        let mut cursor = io::Cursor::new(&buf);
        assert!(read_frame(&mut cursor).unwrap().is_none());
        assert!(read_envelope(&mut cursor).unwrap().is_none());
    }

    #[test]
    fn three_element_envelope() {
        // Build a 3-element envelope manually (no nonce)
        let mut buf = Vec::new();
        cbor_append_head(&mut buf, CBOR_ARRAY, 3);
        cbor_append_int(&mut buf, 10);
        cbor_append_text(&mut buf, "deliver");
        cbor_append_bytes(&mut buf, b"data");

        let decoded = decode_envelope(&buf).unwrap();
        assert_eq!(decoded.handle, 10);
        assert_eq!(decoded.verb, "deliver");
        assert_eq!(decoded.payload, b"data");
        assert_eq!(decoded.nonce, 0); // default
    }
}
