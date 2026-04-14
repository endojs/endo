use std::io::{self, Read, Write};

use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::types::{Envelope, Handle, WorkerInfo};

const CBOR_UINT: u8 = 0;
const CBOR_NEGINT: u8 = 1;
const CBOR_BYTES: u8 = 2;
const CBOR_TEXT: u8 = 3;
const CBOR_ARRAY: u8 = 4;
const CBOR_MAP: u8 = 5;

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

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
// Decoding helpers
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
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "CBOR: unexpected end of input"));
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
            _ => return Err(io::Error::new(io::ErrorKind::InvalidData, format!("CBOR: unsupported info {info}"))),
        };
        if self.pos + size > self.data.len() {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "CBOR: truncated head"));
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
            _ => Err(io::Error::new(io::ErrorKind::InvalidData, format!("CBOR: expected int, got major {major}"))),
        }
    }

    fn read_bytes(&mut self) -> io::Result<Vec<u8>> {
        let (major, len) = self.read_head()?;
        if major != CBOR_BYTES {
            return Err(io::Error::new(io::ErrorKind::InvalidData, format!("CBOR: expected bytes, got major {major}")));
        }
        let len = len as usize;
        if self.pos + len > self.data.len() {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "CBOR: truncated bytes"));
        }
        let result = self.data[self.pos..self.pos + len].to_vec();
        self.pos += len;
        Ok(result)
    }

    fn read_text(&mut self) -> io::Result<String> {
        let (major, len) = self.read_head()?;
        if major != CBOR_TEXT {
            return Err(io::Error::new(io::ErrorKind::InvalidData, format!("CBOR: expected text, got major {major}")));
        }
        let len = len as usize;
        if self.pos + len > self.data.len() {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "CBOR: truncated text"));
        }
        let s = std::str::from_utf8(&self.data[self.pos..self.pos + len])
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        self.pos += len;
        Ok(s.to_string())
    }

    fn read_array_header(&mut self) -> io::Result<u64> {
        let (major, len) = self.read_head()?;
        if major != CBOR_ARRAY {
            return Err(io::Error::new(io::ErrorKind::InvalidData, format!("CBOR: expected array, got major {major}")));
        }
        Ok(len)
    }

    fn read_map_header(&mut self) -> io::Result<u64> {
        let (major, len) = self.read_head()?;
        if major != CBOR_MAP {
            return Err(io::Error::new(io::ErrorKind::InvalidData, format!("CBOR: expected map, got major {major}")));
        }
        Ok(len)
    }

    fn skip(&mut self) -> io::Result<()> {
        let (major, value) = self.read_head()?;
        match major {
            0 | 1 => Ok(()),
            2 | 3 => {
                let len = value as usize;
                if self.pos + len > self.data.len() {
                    return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "CBOR: truncated skip"));
                }
                self.pos += len;
                Ok(())
            }
            4 => {
                for _ in 0..value {
                    self.skip()?;
                }
                Ok(())
            }
            5 => {
                for _ in 0..value {
                    self.skip()?;
                    self.skip()?;
                }
                Ok(())
            }
            _ => Err(io::Error::new(io::ErrorKind::InvalidData, format!("CBOR: unknown major {major}"))),
        }
    }
}

// ---------------------------------------------------------------------------
// Frame I/O (CBOR byte string wrapper)
// ---------------------------------------------------------------------------

/// Read one CBOR byte-string frame from a reader. Returns None on EOF.
pub fn read_frame(r: &mut impl Read) -> io::Result<Option<Vec<u8>>> {
    let mut first = [0u8; 1];
    match r.read_exact(&mut first) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let major = first[0] >> 5;
    if major != CBOR_BYTES {
        return Err(io::Error::new(io::ErrorKind::InvalidData, format!("frame: expected bytes major 2, got {major}")));
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
        ((b[0] as usize) << 24) | ((b[1] as usize) << 16) | ((b[2] as usize) << 8) | b[3] as usize
    } else {
        return Err(io::Error::new(io::ErrorKind::InvalidData, format!("frame: unsupported length info {info}")));
    };
    const MAX_FRAME_SIZE: usize = 16 * 1024 * 1024; // 16 MiB
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

/// Write a CBOR byte-string frame to a writer.
pub fn write_frame(w: &mut impl Write, data: &[u8]) -> io::Result<()> {
    let mut header = Vec::new();
    cbor_append_head(&mut header, CBOR_BYTES, data.len() as u64);
    w.write_all(&header)?;
    w.write_all(data)?;
    w.flush()
}

/// Async version of `read_frame` for use with tokio AsyncRead.
pub async fn async_read_frame(r: &mut (impl AsyncReadExt + Unpin)) -> io::Result<Option<Vec<u8>>> {
    let mut first = [0u8; 1];
    match r.read_exact(&mut first).await {
        Ok(_) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let major = first[0] >> 5;
    if major != CBOR_BYTES {
        return Err(io::Error::new(io::ErrorKind::InvalidData, format!("frame: expected bytes major 2, got {major}")));
    }
    let info = first[0] & 0x1f;
    let len: usize = if info < 24 {
        info as usize
    } else if info == 24 {
        let mut b = [0u8; 1];
        r.read_exact(&mut b).await?;
        b[0] as usize
    } else if info == 25 {
        let mut b = [0u8; 2];
        r.read_exact(&mut b).await?;
        ((b[0] as usize) << 8) | b[1] as usize
    } else if info == 26 {
        let mut b = [0u8; 4];
        r.read_exact(&mut b).await?;
        ((b[0] as usize) << 24) | ((b[1] as usize) << 16) | ((b[2] as usize) << 8) | b[3] as usize
    } else {
        return Err(io::Error::new(io::ErrorKind::InvalidData, format!("frame: unsupported length info {info}")));
    };
    const MAX_FRAME_SIZE: usize = 16 * 1024 * 1024;
    if len > MAX_FRAME_SIZE {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("frame: size {len} exceeds maximum {MAX_FRAME_SIZE}"),
        ));
    }
    let mut buf = vec![0u8; len];
    if len > 0 {
        r.read_exact(&mut buf).await?;
    }
    Ok(Some(buf))
}

/// Async version of `write_frame` for use with tokio AsyncWrite.
pub async fn async_write_frame(w: &mut (impl AsyncWriteExt + Unpin), data: &[u8]) -> io::Result<()> {
    let mut header = Vec::new();
    cbor_append_head(&mut header, CBOR_BYTES, data.len() as u64);
    w.write_all(&header).await?;
    w.write_all(data).await?;
    w.flush().await
}

// ---------------------------------------------------------------------------
// Envelope encoding/decoding
// ---------------------------------------------------------------------------

pub fn encode_envelope(env: &Envelope) -> Vec<u8> {
    let mut buf = Vec::new();
    cbor_append_head(&mut buf, CBOR_ARRAY, 4);
    cbor_append_int(&mut buf, env.handle);
    cbor_append_text(&mut buf, &env.verb);
    cbor_append_bytes(&mut buf, &env.payload);
    cbor_append_int(&mut buf, env.nonce);
    buf
}

pub fn decode_envelope(data: &[u8]) -> io::Result<Envelope> {
    let mut c = Cursor::new(data);
    let n = c.read_array_header()?;
    if n != 3 && n != 4 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, format!("envelope: expected 3 or 4 elements, got {n}")));
    }
    let handle = c.read_int()?;
    let verb = c.read_text()?;
    let payload = c.read_bytes()?;
    let nonce = if n == 4 { c.read_int()? } else { 0 };
    Ok(Envelope { handle, verb, payload, nonce })
}

// ---------------------------------------------------------------------------
// Spawn request encoding/decoding
// ---------------------------------------------------------------------------

pub fn encode_spawn_request(command: &str, args: &[String]) -> Vec<u8> {
    let mut buf = Vec::new();
    cbor_append_head(&mut buf, CBOR_MAP, 2);
    cbor_append_text(&mut buf, "command");
    cbor_append_text(&mut buf, command);
    cbor_append_text(&mut buf, "args");
    cbor_append_head(&mut buf, CBOR_ARRAY, args.len() as u64);
    for arg in args {
        cbor_append_text(&mut buf, arg);
    }
    buf
}

pub fn decode_spawn_request(data: &[u8]) -> io::Result<(String, Vec<String>)> {
    let mut c = Cursor::new(data);
    let n = c.read_map_header()?;
    let mut command = String::new();
    let mut args = Vec::new();
    for _ in 0..n {
        let key = c.read_text()?;
        match key.as_str() {
            "command" => command = c.read_text()?,
            "args" => {
                let alen = c.read_array_header()?;
                for _ in 0..alen {
                    args.push(c.read_text()?);
                }
            }
            _ => c.skip()?,
        }
    }
    Ok((command, args))
}

// ---------------------------------------------------------------------------
// Handle encoding/decoding
// ---------------------------------------------------------------------------

pub fn encode_handle(h: Handle) -> Vec<u8> {
    let mut buf = Vec::new();
    cbor_append_int(&mut buf, h);
    buf
}

pub fn decode_handle(data: &[u8]) -> io::Result<Handle> {
    let mut c = Cursor::new(data);
    c.read_int()
}

// ---------------------------------------------------------------------------
// Worker list encoding
// ---------------------------------------------------------------------------

pub fn encode_worker_list(workers: &[WorkerInfo]) -> Vec<u8> {
    let mut buf = Vec::new();
    cbor_append_head(&mut buf, CBOR_ARRAY, workers.len() as u64);
    for w in workers {
        cbor_append_head(&mut buf, CBOR_MAP, 5);
        cbor_append_text(&mut buf, "handle");
        cbor_append_int(&mut buf, w.handle);
        cbor_append_text(&mut buf, "command");
        cbor_append_text(&mut buf, &w.cmd);
        cbor_append_text(&mut buf, "args");
        cbor_append_head(&mut buf, CBOR_ARRAY, w.args.len() as u64);
        for arg in &w.args {
            cbor_append_text(&mut buf, arg);
        }
        cbor_append_text(&mut buf, "pid");
        cbor_append_int(&mut buf, w.pid as i64);
        cbor_append_text(&mut buf, "started");
        let elapsed = w.started.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
        let secs = elapsed.as_secs();
        // Format as RFC3339-ish timestamp.
        cbor_append_text(&mut buf, &format_timestamp(secs));
    }
    buf
}

fn format_timestamp(epoch_secs: u64) -> String {
    // Simple UTC timestamp without external deps.
    let s = epoch_secs;
    let days = s / 86400;
    let rem = s % 86400;
    let h = rem / 3600;
    let m = (rem % 3600) / 60;
    let sec = rem % 60;
    // Days since 1970-01-01 to Y-M-D (simplified Gregorian).
    let (y, mo, d) = days_to_ymd(days);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{sec:02}Z")
}

fn days_to_ymd(mut days: u64) -> (u64, u64, u64) {
    let mut y = 1970;
    loop {
        let ydays = if is_leap(y) { 366 } else { 365 };
        if days < ydays {
            break;
        }
        days -= ydays;
        y += 1;
    }
    let leap = is_leap(y);
    let mdays = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut mo = 0;
    for (i, &md) in mdays.iter().enumerate() {
        if days < md {
            mo = i as u64 + 1;
            break;
        }
        days -= md;
    }
    (y, mo, days + 1)
}

fn is_leap(y: u64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}
