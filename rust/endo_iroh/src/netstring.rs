//! Async netstring framing, shared by the iroh transport.
//!
//! A netstring frame is `<length>:<data>,` (Bernstein netstrings). Endo
//! layers CapTP over netstring framing on every byte transport; each frame's
//! payload is one JSON-serialized CapTP message. The iroh transport moves
//! these frames opaquely, exactly as the Unix-socket bridge does in
//! `endo::socket`, so a Rust endor and a Node.js daemon frame identically.
//!
//! The codec is generic over any `AsyncRead`/`AsyncWrite`, so it works on an
//! iroh `RecvStream`/`SendStream` as well as a Unix socket half.

use std::io;

use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Upper bound on a single netstring payload (matches `endo::socket`).
pub const MAX_NETSTRING_SIZE: usize = 16 * 1024 * 1024;

/// Read one netstring frame: `<length>:<data>,`.
///
/// Returns `Ok(None)` on a clean end of stream (EOF before any length
/// digit), matching the semantics the bridge relies on to detect a closed
/// peer.
pub async fn read_netstring<R>(reader: &mut R) -> io::Result<Option<Vec<u8>>>
where
    R: tokio::io::AsyncRead + Unpin,
{
    // Read length digits until ':'.
    let mut len_buf: Vec<u8> = Vec::with_capacity(16);
    loop {
        let mut byte = [0u8; 1];
        match reader.read_exact(&mut byte).await {
            Ok(_) => {}
            Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => {
                if len_buf.is_empty() {
                    return Ok(None); // Clean EOF.
                }
                return Err(e);
            }
            Err(e) => return Err(e),
        }
        if byte[0] == b':' {
            break;
        }
        if !byte[0].is_ascii_digit() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("netstring: expected digit or ':', got {}", byte[0]),
            ));
        }
        len_buf.push(byte[0]);
        if len_buf.len() > 10 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "netstring: length field too long",
            ));
        }
    }
    let len_str =
        std::str::from_utf8(&len_buf).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    let len: usize = len_str
        .parse()
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

    if len > MAX_NETSTRING_SIZE {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("netstring: size {len} exceeds maximum"),
        ));
    }

    // Read data.
    let mut data = vec![0u8; len];
    if len > 0 {
        reader.read_exact(&mut data).await?;
    }

    // Read trailing comma.
    let mut comma = [0u8; 1];
    reader.read_exact(&mut comma).await?;
    if comma[0] != b',' {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("netstring: expected ',', got {}", comma[0]),
        ));
    }

    Ok(Some(data))
}

/// Write one netstring frame: `<length>:<data>,`.
pub async fn write_netstring<W>(writer: &mut W, data: &[u8]) -> io::Result<()>
where
    W: tokio::io::AsyncWrite + Unpin,
{
    let header = format!("{}:", data.len());
    writer.write_all(header.as_bytes()).await?;
    writer.write_all(data).await?;
    writer.write_all(b",").await?;
    writer.flush().await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn round_trip_frames() {
        let mut buf: Vec<u8> = Vec::new();
        write_netstring(&mut buf, b"hello").await.unwrap();
        write_netstring(&mut buf, b"").await.unwrap();
        write_netstring(&mut buf, b"world!").await.unwrap();

        let mut reader = &buf[..];
        assert_eq!(
            read_netstring(&mut reader).await.unwrap().as_deref(),
            Some(&b"hello"[..])
        );
        assert_eq!(
            read_netstring(&mut reader).await.unwrap().as_deref(),
            Some(&b""[..])
        );
        assert_eq!(
            read_netstring(&mut reader).await.unwrap().as_deref(),
            Some(&b"world!"[..])
        );
        assert_eq!(read_netstring(&mut reader).await.unwrap(), None);
    }

    #[tokio::test]
    async fn exact_wire_format() {
        let mut buf: Vec<u8> = Vec::new();
        write_netstring(&mut buf, b"abc").await.unwrap();
        assert_eq!(&buf, b"3:abc,");
    }

    #[tokio::test]
    async fn rejects_bad_length_byte() {
        let mut reader = &b"3x:abc,"[..];
        let err = read_netstring(&mut reader).await.unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::InvalidData);
    }

    #[tokio::test]
    async fn rejects_missing_comma() {
        let mut reader = &b"3:abcX"[..];
        let err = read_netstring(&mut reader).await.unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::InvalidData);
    }

    #[tokio::test]
    async fn truncated_payload_is_error_not_eof() {
        // Length announced but stream ends mid-payload: this is a torn
        // frame, distinct from a clean EOF between frames.
        let mut reader = &b"5:ab"[..];
        let err = read_netstring(&mut reader).await.unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::UnexpectedEof);
    }
}
