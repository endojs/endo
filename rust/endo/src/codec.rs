use std::io::{self, Read, Write};

use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::types::{Envelope, Handle, MeterMode, MeterState, WorkerInfo};

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

pub fn encode_spawn_request(platform: &str, command: &str, args: &[String]) -> Vec<u8> {
    let mut buf = Vec::new();
    cbor_append_head(&mut buf, CBOR_MAP, 3);
    cbor_append_text(&mut buf, "platform");
    cbor_append_text(&mut buf, platform);
    cbor_append_text(&mut buf, "command");
    cbor_append_text(&mut buf, command);
    cbor_append_text(&mut buf, "args");
    cbor_append_head(&mut buf, CBOR_ARRAY, args.len() as u64);
    for arg in args {
        cbor_append_text(&mut buf, arg);
    }
    buf
}

pub fn decode_spawn_request(data: &[u8]) -> io::Result<(String, String, Vec<String>)> {
    let mut c = Cursor::new(data);
    let n = c.read_map_header()?;
    let mut platform = String::new();
    let mut command = String::new();
    let mut args = Vec::new();
    for _ in 0..n {
        let key = c.read_text()?;
        match key.as_str() {
            "platform" => platform = c.read_text()?,
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
    // Default to "separate" for backward compat with old payloads.
    if platform.is_empty() {
        platform = "separate".to_string();
    }
    Ok((platform, command, args))
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
// listen-path request decoding (CBOR map: {"path": <text>})
// ---------------------------------------------------------------------------

pub fn decode_listen_path_request(data: &[u8]) -> io::Result<String> {
    let mut c = Cursor::new(data);
    let n = c.read_map_header()?;
    let mut path = String::new();
    for _ in 0..n {
        let key = c.read_text()?;
        match key.as_str() {
            "path" => path = c.read_text()?,
            _ => c.skip()?,
        }
    }
    if path.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "listen-path: missing or empty path",
        ));
    }
    Ok(path)
}

// ---------------------------------------------------------------------------
// Suspend request decoding (CBOR map: {"handle": <i64>})
// ---------------------------------------------------------------------------

pub fn decode_suspend_request(data: &[u8]) -> io::Result<Handle> {
    let mut c = Cursor::new(data);
    let n = c.read_map_header()?;
    let mut target: Handle = 0;
    for _ in 0..n {
        let key = c.read_text()?;
        match key.as_str() {
            "handle" => target = c.read_int()?,
            _ => c.skip()?,
        }
    }
    if target == 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "suspend: missing or zero handle",
        ));
    }
    Ok(target)
}

// ---------------------------------------------------------------------------
// Worker list encoding
// ---------------------------------------------------------------------------

pub fn encode_worker_list(workers: &[WorkerInfo]) -> Vec<u8> {
    let mut buf = Vec::new();
    cbor_append_head(&mut buf, CBOR_ARRAY, workers.len() as u64);
    for w in workers {
        cbor_append_head(&mut buf, CBOR_MAP, 6);
        cbor_append_text(&mut buf, "handle");
        cbor_append_int(&mut buf, w.handle);
        cbor_append_text(&mut buf, "platform");
        cbor_append_text(&mut buf, &w.platform);
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

// ---------------------------------------------------------------------------
// Metering codec functions
// ---------------------------------------------------------------------------

/// Decode a meter-report payload.
/// CBOR map: {"handle": <i64>, "steps": <u64>, "outcome": <text>}
pub fn decode_meter_report(data: &[u8]) -> io::Result<(Handle, u64, String)> {
    let mut c = Cursor::new(data);
    let n = c.read_map_header()?;
    let mut handle: Handle = 0;
    let mut steps: u64 = 0;
    let mut outcome = String::new();
    for _ in 0..n {
        let key = c.read_text()?;
        match key.as_str() {
            "handle" => handle = c.read_int()?,
            "steps" => steps = c.read_int()? as u64,
            "outcome" => outcome = c.read_text()?,
            _ => c.skip()?,
        }
    }
    Ok((handle, steps, outcome))
}

/// Decode a handle-bearing request payload.
/// CBOR map: {"handle": <i64>}
pub fn decode_handle_request(data: &[u8]) -> io::Result<Handle> {
    let mut c = Cursor::new(data);
    let n = c.read_map_header()?;
    let mut handle: Handle = 0;
    for _ in 0..n {
        let key = c.read_text()?;
        match key.as_str() {
            "handle" => handle = c.read_int()?,
            _ => c.skip()?,
        }
    }
    if handle == 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "meter request: missing or zero handle",
        ));
    }
    Ok(handle)
}

/// Encode a meter-query response.
/// CBOR map with the target handle and current meter state fields.
pub fn encode_meter_query_response(target: Handle, state: Option<&MeterState>) -> Vec<u8> {
    let mut buf = Vec::new();
    match state {
        Some(s) => {
            let mode_str = match s.mode {
                MeterMode::Measurement => "measurement",
                MeterMode::Quota => "quota",
                MeterMode::RateLimited => "rate-limited",
            };
            cbor_append_head(&mut buf, CBOR_MAP, 5);
            cbor_append_text(&mut buf, "handle");
            cbor_append_int(&mut buf, target);
            cbor_append_text(&mut buf, "mode");
            cbor_append_text(&mut buf, mode_str);
            cbor_append_text(&mut buf, "accumulated");
            cbor_append_head(&mut buf, CBOR_UINT, s.accumulated);
            cbor_append_text(&mut buf, "budget");
            cbor_append_head(&mut buf, CBOR_UINT, s.budget);
            cbor_append_text(&mut buf, "hardLimit");
            cbor_append_head(&mut buf, CBOR_UINT, s.hard_limit);
        }
        None => {
            cbor_append_head(&mut buf, CBOR_MAP, 2);
            cbor_append_text(&mut buf, "handle");
            cbor_append_int(&mut buf, target);
            cbor_append_text(&mut buf, "mode");
            cbor_append_text(&mut buf, "measurement");
        }
    }
    buf
}

/// Decode a meter-set-quota payload.
/// CBOR map: {"handle": <i64>, "hardLimit": <u64>, "budget": <u64>}
pub fn decode_meter_set_quota(data: &[u8]) -> io::Result<(Handle, u64, u64)> {
    let mut c = Cursor::new(data);
    let n = c.read_map_header()?;
    let mut handle: Handle = 0;
    let mut hard_limit: u64 = 0;
    let mut budget: u64 = 0;
    for _ in 0..n {
        let key = c.read_text()?;
        match key.as_str() {
            "handle" => handle = c.read_int()?,
            "hardLimit" => hard_limit = c.read_int()? as u64,
            "budget" => budget = c.read_int()? as u64,
            _ => c.skip()?,
        }
    }
    if handle == 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "meter-set-quota: missing or zero handle",
        ));
    }
    Ok((handle, hard_limit, budget))
}

/// Decode a meter-set-rate payload.
/// CBOR map: {"handle": <i64>, "hardLimit": <u64>, "rate": <u64>, "burst": <u64>}
pub fn decode_meter_set_rate(data: &[u8]) -> io::Result<(Handle, u64, u64, u64)> {
    let mut c = Cursor::new(data);
    let n = c.read_map_header()?;
    let mut handle: Handle = 0;
    let mut hard_limit: u64 = 0;
    let mut rate: u64 = 0;
    let mut burst: u64 = 0;
    for _ in 0..n {
        let key = c.read_text()?;
        match key.as_str() {
            "handle" => handle = c.read_int()?,
            "hardLimit" => hard_limit = c.read_int()? as u64,
            "rate" => rate = c.read_int()? as u64,
            "burst" => burst = c.read_int()? as u64,
            _ => c.skip()?,
        }
    }
    if handle == 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "meter-set-rate: missing or zero handle",
        ));
    }
    Ok((handle, hard_limit, rate, burst))
}

/// Decode a meter-refill payload.
/// CBOR map: {"handle": <i64>, "amount": <u64>}
pub fn decode_meter_refill(data: &[u8]) -> io::Result<(Handle, u64)> {
    let mut c = Cursor::new(data);
    let n = c.read_map_header()?;
    let mut handle: Handle = 0;
    let mut amount: u64 = 0;
    for _ in 0..n {
        let key = c.read_text()?;
        match key.as_str() {
            "handle" => handle = c.read_int()?,
            "amount" => amount = c.read_int()? as u64,
            _ => c.skip()?,
        }
    }
    if handle == 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "meter-refill: missing or zero handle",
        ));
    }
    Ok((handle, amount))
}

/// Encode a meter-refill acknowledgement.
/// CBOR map: {"handle": <i64>, "budget": <u64>}
pub fn encode_meter_refill_response(target: Handle, new_budget: u64) -> Vec<u8> {
    let mut buf = Vec::new();
    cbor_append_head(&mut buf, CBOR_MAP, 2);
    cbor_append_text(&mut buf, "handle");
    cbor_append_int(&mut buf, target);
    cbor_append_text(&mut buf, "budget");
    cbor_append_head(&mut buf, CBOR_UINT, new_budget);
    buf
}

/// Encode a meter-config envelope payload.
/// CBOR map: {"hardLimit": <u64>}
pub fn encode_meter_config(hard_limit: u64) -> Vec<u8> {
    let mut buf = Vec::new();
    cbor_append_head(&mut buf, CBOR_MAP, 1);
    cbor_append_text(&mut buf, "hardLimit");
    cbor_append_head(&mut buf, CBOR_UINT, hard_limit);
    buf
}

// ---------------------------------------------------------------------------
// CAS verb codec
// ---------------------------------------------------------------------------

/// Decode `cas-store` payload: CBOR map `{"data": <bytes>, "type": <text>}`.
/// Returns `(data, content_type)`.
pub fn decode_cas_store(data: &[u8]) -> io::Result<(Vec<u8>, String)> {
    let mut c = Cursor::new(data);
    let n = c.read_map_header()?;
    let mut blob_data: Vec<u8> = Vec::new();
    let mut content_type = "blob".to_string();
    for _ in 0..n {
        let key = c.read_text()?;
        match key.as_str() {
            "data" => blob_data = c.read_bytes()?,
            "type" => content_type = c.read_text()?,
            _ => c.skip()?,
        }
    }
    Ok((blob_data, content_type))
}

/// Encode `cas-stored` response: CBOR map `{"hash": <text>}`.
pub fn encode_cas_stored(hash: &str) -> Vec<u8> {
    let mut buf = Vec::new();
    cbor_append_head(&mut buf, CBOR_MAP, 1);
    cbor_append_text(&mut buf, "hash");
    cbor_append_text(&mut buf, hash);
    buf
}

/// Decode `cas-fetch` / `cas-has` payload: CBOR map `{"hash": <text>}`.
/// Returns the hash string.
pub fn decode_cas_hash_request(data: &[u8]) -> io::Result<String> {
    let mut c = Cursor::new(data);
    let n = c.read_map_header()?;
    let mut hash = String::new();
    for _ in 0..n {
        let key = c.read_text()?;
        match key.as_str() {
            "hash" => hash = c.read_text()?,
            _ => c.skip()?,
        }
    }
    Ok(hash)
}

/// Encode `cas-content` response: raw bytes as CBOR map `{"data": <bytes>}`.
pub fn encode_cas_content(data: &[u8]) -> Vec<u8> {
    let mut buf = Vec::new();
    cbor_append_head(&mut buf, CBOR_MAP, 1);
    cbor_append_text(&mut buf, "data");
    cbor_append_head(&mut buf, CBOR_BYTES, data.len() as u64);
    buf.extend_from_slice(data);
    buf
}

/// Encode `cas-gc-done` response: CBOR map `{"freedCount": <u64>, "freedBytes": <u64>}`.
pub fn encode_gc_report(freed_count: u64, freed_bytes: u64) -> Vec<u8> {
    let mut buf = Vec::new();
    cbor_append_head(&mut buf, CBOR_MAP, 2);
    cbor_append_text(&mut buf, "freedCount");
    cbor_append_head(&mut buf, CBOR_UINT, freed_count);
    cbor_append_text(&mut buf, "freedBytes");
    cbor_append_head(&mut buf, CBOR_UINT, freed_bytes);
    buf
}

/// Encode `cas-exists` response: CBOR map `{"exists": <bool>}`.
pub fn encode_cas_exists(exists: bool) -> Vec<u8> {
    let mut buf = Vec::new();
    cbor_append_head(&mut buf, CBOR_MAP, 1);
    cbor_append_text(&mut buf, "exists");
    // CBOR true = 0xf5, false = 0xf4 (simple values 20/21).
    buf.push(if exists { 0xf5 } else { 0xf4 });
    buf
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::SystemTime;

    #[test]
    fn spawn_request_round_trip_separate() {
        let args = vec!["arg1".to_string(), "arg2".to_string()];
        let encoded = encode_spawn_request("separate", "/bin/worker", &args);
        let (platform, command, decoded_args) = decode_spawn_request(&encoded).unwrap();
        assert_eq!(platform, "separate");
        assert_eq!(command, "/bin/worker");
        assert_eq!(decoded_args, args);
    }

    #[test]
    fn spawn_request_round_trip_shared() {
        let encoded = encode_spawn_request("shared", "", &[]);
        let (platform, command, args) = decode_spawn_request(&encoded).unwrap();
        assert_eq!(platform, "shared");
        assert_eq!(command, "");
        assert!(args.is_empty());
    }

    #[test]
    fn spawn_request_legacy_no_platform() {
        // Simulate a legacy 2-entry map without "platform" key.
        let mut buf = Vec::new();
        cbor_append_head(&mut buf, CBOR_MAP, 2);
        cbor_append_text(&mut buf, "command");
        cbor_append_text(&mut buf, "/bin/old-worker");
        cbor_append_text(&mut buf, "args");
        cbor_append_head(&mut buf, CBOR_ARRAY, 0);
        let (platform, command, args) = decode_spawn_request(&buf).unwrap();
        assert_eq!(platform, "separate"); // default
        assert_eq!(command, "/bin/old-worker");
        assert!(args.is_empty());
    }

    #[test]
    fn worker_list_includes_platform() {
        let workers = vec![WorkerInfo {
            handle: 42,
            platform: "shared".to_string(),
            cmd: "<in-process>".to_string(),
            args: Vec::new(),
            pid: 1234,
            started: SystemTime::UNIX_EPOCH,
        }];
        let encoded = encode_worker_list(&workers);
        // Decode and verify the platform field is present.
        let mut c = Cursor::new(&encoded);
        let n = c.read_array_header().unwrap();
        assert_eq!(n, 1);
        let map_len = c.read_map_header().unwrap();
        assert_eq!(map_len, 6);
        let mut found_platform = false;
        for _ in 0..map_len {
            let key = c.read_text().unwrap();
            if key == "platform" {
                let val = c.read_text().unwrap();
                assert_eq!(val, "shared");
                found_platform = true;
            } else {
                c.skip().unwrap();
            }
        }
        assert!(found_platform, "platform field not found in worker list");
    }

    // --- Metering codec tests ---

    #[test]
    fn meter_report_round_trip() {
        // Encode a meter-report payload manually, then decode.
        let mut buf = Vec::new();
        cbor_append_head(&mut buf, CBOR_MAP, 3);
        cbor_append_text(&mut buf, "handle");
        cbor_append_int(&mut buf, 7);
        cbor_append_text(&mut buf, "steps");
        cbor_append_head(&mut buf, CBOR_UINT, 42000);
        cbor_append_text(&mut buf, "outcome");
        cbor_append_text(&mut buf, "ok");

        let (handle, steps, outcome) = decode_meter_report(&buf).unwrap();
        assert_eq!(handle, 7);
        assert_eq!(steps, 42000);
        assert_eq!(outcome, "ok");
    }

    #[test]
    fn meter_report_terminated() {
        let mut buf = Vec::new();
        cbor_append_head(&mut buf, CBOR_MAP, 3);
        cbor_append_text(&mut buf, "handle");
        cbor_append_int(&mut buf, 3);
        cbor_append_text(&mut buf, "steps");
        cbor_append_head(&mut buf, CBOR_UINT, 100_000);
        cbor_append_text(&mut buf, "outcome");
        cbor_append_text(&mut buf, "terminated");

        let (handle, steps, outcome) = decode_meter_report(&buf).unwrap();
        assert_eq!(handle, 3);
        assert_eq!(steps, 100_000);
        assert_eq!(outcome, "terminated");
    }

    #[test]
    fn handle_request_round_trip() {
        let mut buf = Vec::new();
        cbor_append_head(&mut buf, CBOR_MAP, 1);
        cbor_append_text(&mut buf, "handle");
        cbor_append_int(&mut buf, 99);

        let h = decode_handle_request(&buf).unwrap();
        assert_eq!(h, 99);
    }

    #[test]
    fn handle_request_missing_handle() {
        let mut buf = Vec::new();
        cbor_append_head(&mut buf, CBOR_MAP, 0);

        assert!(decode_handle_request(&buf).is_err());
    }

    #[test]
    fn meter_query_response_with_state() {
        let state = MeterState {
            mode: MeterMode::Quota,
            accumulated: 5000,
            budget: 3000,
            hard_limit: 1000,
            rate_limit: None,
        };
        let encoded = encode_meter_query_response(42, Some(&state));
        let mut c = Cursor::new(&encoded);
        let n = c.read_map_header().unwrap();
        assert_eq!(n, 5);
        let mut mode = String::new();
        let mut accumulated = 0u64;
        let mut budget = 0u64;
        let mut hard_limit = 0u64;
        for _ in 0..n {
            let key = c.read_text().unwrap();
            match key.as_str() {
                "mode" => mode = c.read_text().unwrap(),
                "accumulated" => accumulated = c.read_int().unwrap() as u64,
                "budget" => budget = c.read_int().unwrap() as u64,
                "hardLimit" => hard_limit = c.read_int().unwrap() as u64,
                _ => c.skip().unwrap(),
            }
        }
        assert_eq!(mode, "quota");
        assert_eq!(accumulated, 5000);
        assert_eq!(budget, 3000);
        assert_eq!(hard_limit, 1000);
    }

    #[test]
    fn meter_query_response_no_state() {
        let encoded = encode_meter_query_response(42, None);
        let mut c = Cursor::new(&encoded);
        let n = c.read_map_header().unwrap();
        assert_eq!(n, 2);
        let mut mode = String::new();
        for _ in 0..n {
            let key = c.read_text().unwrap();
            match key.as_str() {
                "mode" => mode = c.read_text().unwrap(),
                _ => c.skip().unwrap(),
            }
        }
        assert_eq!(mode, "measurement");
    }

    #[test]
    fn meter_set_quota_round_trip() {
        let mut buf = Vec::new();
        cbor_append_head(&mut buf, CBOR_MAP, 3);
        cbor_append_text(&mut buf, "handle");
        cbor_append_int(&mut buf, 5);
        cbor_append_text(&mut buf, "hardLimit");
        cbor_append_head(&mut buf, CBOR_UINT, 10_000);
        cbor_append_text(&mut buf, "budget");
        cbor_append_head(&mut buf, CBOR_UINT, 50_000);

        let (h, hl, b) = decode_meter_set_quota(&buf).unwrap();
        assert_eq!(h, 5);
        assert_eq!(hl, 10_000);
        assert_eq!(b, 50_000);
    }

    #[test]
    fn meter_set_rate_round_trip() {
        let mut buf = Vec::new();
        cbor_append_head(&mut buf, CBOR_MAP, 4);
        cbor_append_text(&mut buf, "handle");
        cbor_append_int(&mut buf, 8);
        cbor_append_text(&mut buf, "hardLimit");
        cbor_append_head(&mut buf, CBOR_UINT, 5_000);
        cbor_append_text(&mut buf, "rate");
        cbor_append_head(&mut buf, CBOR_UINT, 1_000);
        cbor_append_text(&mut buf, "burst");
        cbor_append_head(&mut buf, CBOR_UINT, 20_000);

        let (h, hl, r, b) = decode_meter_set_rate(&buf).unwrap();
        assert_eq!(h, 8);
        assert_eq!(hl, 5_000);
        assert_eq!(r, 1_000);
        assert_eq!(b, 20_000);
    }

    #[test]
    fn meter_refill_round_trip() {
        let mut buf = Vec::new();
        cbor_append_head(&mut buf, CBOR_MAP, 2);
        cbor_append_text(&mut buf, "handle");
        cbor_append_int(&mut buf, 12);
        cbor_append_text(&mut buf, "amount");
        cbor_append_head(&mut buf, CBOR_UINT, 25_000);

        let (h, a) = decode_meter_refill(&buf).unwrap();
        assert_eq!(h, 12);
        assert_eq!(a, 25_000);
    }

    #[test]
    fn meter_refill_response_round_trip() {
        let encoded = encode_meter_refill_response(12, 75_000);
        let mut c = Cursor::new(&encoded);
        let n = c.read_map_header().unwrap();
        assert_eq!(n, 2);
        let mut handle: Handle = 0;
        let mut budget = 0u64;
        for _ in 0..n {
            let key = c.read_text().unwrap();
            match key.as_str() {
                "handle" => handle = c.read_int().unwrap(),
                "budget" => budget = c.read_int().unwrap() as u64,
                _ => c.skip().unwrap(),
            }
        }
        assert_eq!(handle, 12);
        assert_eq!(budget, 75_000);
    }

    #[test]
    fn meter_config_round_trip() {
        let encoded = encode_meter_config(10_000);
        let mut c = Cursor::new(&encoded);
        let n = c.read_map_header().unwrap();
        assert_eq!(n, 1);
        let key = c.read_text().unwrap();
        assert_eq!(key, "hardLimit");
        let val = c.read_int().unwrap() as u64;
        assert_eq!(val, 10_000);
    }

    // CAS codec tests

    #[test]
    fn cas_store_round_trip() {
        // Build a cas-store payload manually.
        let mut buf = Vec::new();
        cbor_append_head(&mut buf, CBOR_MAP, 2);
        cbor_append_text(&mut buf, "data");
        let data = b"hello CAS";
        cbor_append_head(&mut buf, CBOR_BYTES, data.len() as u64);
        buf.extend_from_slice(data);
        cbor_append_text(&mut buf, "type");
        cbor_append_text(&mut buf, "snapshot");

        let (decoded_data, content_type) = decode_cas_store(&buf).unwrap();
        assert_eq!(decoded_data, data);
        assert_eq!(content_type, "snapshot");
    }

    #[test]
    fn cas_stored_decode() {
        let encoded = encode_cas_stored("abc123def456");
        let hash = decode_cas_hash_request(&encoded).unwrap();
        assert_eq!(hash, "abc123def456");
    }

    #[test]
    fn cas_content_round_trip() {
        let data = b"module source";
        let encoded = encode_cas_content(data);
        // Decode manually: map with "data" key.
        let mut c = Cursor::new(&encoded);
        let n = c.read_map_header().unwrap();
        assert_eq!(n, 1);
        let key = c.read_text().unwrap();
        assert_eq!(key, "data");
        let decoded = c.read_bytes().unwrap();
        assert_eq!(decoded, data);
    }

    #[test]
    fn cas_exists_encode() {
        let encoded_true = encode_cas_exists(true);
        // Map with "exists" key and CBOR true (0xf5).
        assert!(encoded_true.contains(&0xf5));

        let encoded_false = encode_cas_exists(false);
        assert!(encoded_false.contains(&0xf4));
    }
}
