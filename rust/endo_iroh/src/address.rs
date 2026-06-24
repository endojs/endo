//! Pure helpers for the iroh transport's address scheme.
//!
//! These have no dependency on a live iroh endpoint, so they are unit
//! tested without binding a node. The scheme is byte-for-byte the same as
//! the Node.js `@endo/daemon` transport (`src/networks/iroh-address.js`),
//! so an address produced by one runtime parses on the other.
//!
//! An iroh address has the form:
//!
//! ```text
//! iroh+captp0:///<nodeId>?relay=<relayUrl>&addr=<directAddr>&addr=<...>
//! ```
//!
//! The case-sensitive `NodeId` is carried in the URL *pathname* (not the
//! hostname, which URL parsing lowercases). `relay` and `addr` are dialing
//! *hints*: a peer may always be dialed by `NodeId` alone and resolved
//! through iroh discovery, but published hints let a dialer skip a discovery
//! round-trip. Loopback and private addresses are excluded from hints.

use url::Url;

/// URL scheme identifying the Endo CapTP-over-iroh transport.
pub const IROH_URL_PROTOCOL: &str = "iroh+captp0";

/// A parsed iroh address: a node id plus optional relay/direct-address
/// dialing hints. Mirrors the `NodeAddr`/`EndpointAddr` shape the dialer
/// constructs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IrohAddress {
    /// The iroh node id (Ed25519 public key, base32).
    pub node_id: String,
    /// Home relay URL hint, if published.
    pub relay_url: Option<String>,
    /// Direct socket-address hints (`host:port`), if published.
    pub addresses: Vec<String>,
}

/// Errors parsing an iroh address string.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AddressError {
    /// The string did not parse as a URL.
    InvalidUrl(String),
    /// The URL scheme was not `iroh+captp0`.
    WrongProtocol(String),
    /// The address carried no node id in its pathname.
    MissingNodeId(String),
}

impl std::fmt::Display for AddressError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AddressError::InvalidUrl(a) => write!(f, "invalid iroh address {a:?}"),
            AddressError::WrongProtocol(a) => {
                write!(f, "address {a:?} is not an {IROH_URL_PROTOCOL} address")
            }
            AddressError::MissingNodeId(a) => write!(f, "iroh address {a:?} has no nodeId"),
        }
    }
}

impl std::error::Error for AddressError {}

/// Decide whether a direct socket address (`host:port`) is worth publishing
/// as a dialing hint. Loopback and private/link-local ranges are excluded
/// since they are not useful to a remote dialer.
///
/// Mirrors `isPublishableDirectAddress` in `iroh-address.js`.
pub fn is_publishable_direct_address(addr: &str) -> bool {
    // Strip the port. IPv6 literals are bracketed: `[::1]:5000`.
    let host = if let Some(rest) = addr.strip_prefix('[') {
        match rest.find(']') {
            Some(close) => &rest[..close],
            None => addr,
        }
    } else if let Some(colon) = addr.rfind(':') {
        &addr[..colon]
    } else {
        addr
    };
    let host = host.to_ascii_lowercase();

    if host == "127.0.0.1" || host.starts_with("127.") {
        return false;
    }
    if host == "0.0.0.0" {
        return false;
    }
    if host == "::1" || host == "::" {
        return false;
    }
    if host.starts_with("10.") {
        return false;
    }
    if host.starts_with("192.168.") {
        return false;
    }
    // 172.16.0.0 - 172.31.255.255
    if let Some(rest) = host.strip_prefix("172.") {
        if let Some(second) = rest.split('.').next() {
            if let Ok(n) = second.parse::<u32>() {
                if (16..=31).contains(&n) {
                    return false;
                }
            }
        }
    }
    // Link-local IPv4 169.254/16.
    if host.starts_with("169.254.") {
        return false;
    }
    // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
    if host.starts_with("fc") || host.starts_with("fd") {
        return false;
    }
    if host.starts_with("fe8")
        || host.starts_with("fe9")
        || host.starts_with("fea")
        || host.starts_with("feb")
    {
        return false;
    }
    true
}

/// Build the published address string for an iroh node.
///
/// Mirrors `buildIrohAddress` in `iroh-address.js`. When `include_private`
/// is false, loopback/private direct addresses are filtered out of the
/// published hints.
pub fn build_iroh_address(
    node_id: &str,
    relay_url: Option<&str>,
    addresses: &[String],
    include_private: bool,
) -> String {
    let mut url = Url::parse(&format!("{IROH_URL_PROTOCOL}:///")).expect("static URL is valid");
    // The node id goes in the pathname, matching the WHATWG `URL.pathname`
    // assignment the Node.js builder performs.
    url.set_path(&format!("/{node_id}"));
    {
        let mut pairs = url.query_pairs_mut();
        if let Some(relay) = relay_url {
            pairs.append_pair("relay", relay);
        }
        for addr in addresses {
            if include_private || is_publishable_direct_address(addr) {
                pairs.append_pair("addr", addr);
            }
        }
    }
    // A URL with no query pairs still renders without a trailing `?`.
    url.to_string()
}

/// Parse an iroh address string into a node id plus optional relay/direct
/// dialing hints.
///
/// Mirrors `parseIrohAddress` in `iroh-address.js`.
pub fn parse_iroh_address(address: &str) -> Result<IrohAddress, AddressError> {
    let url = Url::parse(address).map_err(|_| AddressError::InvalidUrl(address.to_string()))?;
    if url.scheme() != IROH_URL_PROTOCOL {
        return Err(AddressError::WrongProtocol(address.to_string()));
    }
    let node_id = url.path().trim_start_matches('/').to_string();
    if node_id.is_empty() {
        return Err(AddressError::MissingNodeId(address.to_string()));
    }
    let mut relay_url = None;
    let mut addresses = Vec::new();
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "relay" => {
                if relay_url.is_none() && !value.is_empty() {
                    relay_url = Some(value.into_owned());
                }
            }
            "addr" => addresses.push(value.into_owned()),
            _ => {}
        }
    }
    Ok(IrohAddress {
        node_id,
        relay_url,
        addresses,
    })
}

/// Whether the iroh transport handles the given address or protocol string.
///
/// Mirrors `supportsIrohAddress` in `iroh-address.js`.
pub fn supports_iroh_address(address_or_protocol: &str) -> bool {
    if let Ok(url) = Url::parse(address_or_protocol) {
        return url.scheme() == IROH_URL_PROTOCOL;
    }
    address_or_protocol == format!("{IROH_URL_PROTOCOL}:")
        || address_or_protocol == IROH_URL_PROTOCOL
}

/// Derive the deterministic 32-byte Ed25519 secret for the iroh node from
/// the daemon's `NodeNumber`, so the iroh `NodeId` is stable across restarts
/// and identical to the one the Node.js transport derives.
///
/// Mirrors `deriveIrohSecretKey` in `iroh.js`: the secret is the first 32
/// bytes of the hex-decoded 64-character `NodeNumber`.
pub fn derive_iroh_secret_key(node_id_hex: &str) -> Result<[u8; 32], String> {
    let bytes = hex::decode(node_id_hex).map_err(|e| format!("node id is not valid hex: {e}"))?;
    if bytes.len() < 32 {
        return Err(format!(
            "node id decodes to {} bytes, need at least 32",
            bytes.len()
        ));
    }
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&bytes[..32]);
    Ok(seed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_parse_round_trip() {
        let node_id = "abcdefghijklmnop";
        let addrs = vec!["1.2.3.4:5000".to_string()];
        let built = build_iroh_address(
            node_id,
            Some("https://euw1.relay.iroh.network./"),
            &addrs,
            false,
        );
        let parsed = parse_iroh_address(&built).unwrap();
        assert_eq!(parsed.node_id, node_id);
        assert_eq!(
            parsed.relay_url.as_deref(),
            Some("https://euw1.relay.iroh.network./")
        );
        assert_eq!(parsed.addresses, addrs);
    }

    #[test]
    fn build_keeps_node_id_case() {
        // The base32 node id is case-sensitive and must survive in the path.
        let node_id = "AaBbCcNodeId22334455";
        let built = build_iroh_address(node_id, None, &[], false);
        let parsed = parse_iroh_address(&built).unwrap();
        assert_eq!(parsed.node_id, node_id);
    }

    #[test]
    fn parses_node_id_only_address() {
        let parsed = parse_iroh_address("iroh+captp0:///justthenodeid").unwrap();
        assert_eq!(parsed.node_id, "justthenodeid");
        assert_eq!(parsed.relay_url, None);
        assert!(parsed.addresses.is_empty());
    }

    #[test]
    fn parses_node_js_built_address() {
        // Encoding as produced by the Node.js `URLSearchParams` builder.
        let js = "iroh+captp0:///NODEID?relay=https%3A%2F%2Feuw1.relay.iroh.network.%2F&addr=1.2.3.4%3A5000";
        let parsed = parse_iroh_address(js).unwrap();
        assert_eq!(parsed.node_id, "NODEID");
        assert_eq!(
            parsed.relay_url.as_deref(),
            Some("https://euw1.relay.iroh.network./")
        );
        assert_eq!(parsed.addresses, vec!["1.2.3.4:5000".to_string()]);
    }

    #[test]
    fn rejects_wrong_protocol() {
        assert_eq!(
            parse_iroh_address("https://example.com/x"),
            Err(AddressError::WrongProtocol(
                "https://example.com/x".to_string()
            ))
        );
    }

    #[test]
    fn rejects_missing_node_id() {
        assert_eq!(
            parse_iroh_address("iroh+captp0:///"),
            Err(AddressError::MissingNodeId("iroh+captp0:///".to_string()))
        );
    }

    #[test]
    fn private_addresses_filtered_by_default() {
        let addrs = vec![
            "127.0.0.1:5000".to_string(),
            "10.0.0.5:5000".to_string(),
            "192.168.1.2:5000".to_string(),
            "172.16.0.1:5000".to_string(),
            "169.254.1.1:5000".to_string(),
            "203.0.113.7:5000".to_string(),
            "[::1]:5000".to_string(),
            "[fe80::1]:5000".to_string(),
        ];
        let built = build_iroh_address("nodeid", None, &addrs, false);
        let parsed = parse_iroh_address(&built).unwrap();
        assert_eq!(parsed.addresses, vec!["203.0.113.7:5000".to_string()]);
    }

    #[test]
    fn private_addresses_kept_when_requested() {
        let addrs = vec!["127.0.0.1:5000".to_string(), "203.0.113.7:5000".to_string()];
        let built = build_iroh_address("nodeid", None, &addrs, true);
        let parsed = parse_iroh_address(&built).unwrap();
        assert_eq!(parsed.addresses, addrs);
    }

    #[test]
    fn publishable_classification() {
        assert!(!is_publishable_direct_address("127.0.0.1:1"));
        assert!(!is_publishable_direct_address("0.0.0.0:1"));
        assert!(!is_publishable_direct_address("10.1.2.3:1"));
        assert!(!is_publishable_direct_address("192.168.0.1:1"));
        assert!(!is_publishable_direct_address("172.16.0.1:1"));
        assert!(!is_publishable_direct_address("172.31.255.255:1"));
        assert!(is_publishable_direct_address("172.32.0.1:1"));
        assert!(!is_publishable_direct_address("169.254.0.1:1"));
        assert!(!is_publishable_direct_address("[::1]:1"));
        assert!(!is_publishable_direct_address("[fe80::1]:1"));
        assert!(!is_publishable_direct_address("[fc00::1]:1"));
        assert!(is_publishable_direct_address("8.8.8.8:53"));
        assert!(is_publishable_direct_address("[2001:db8::1]:53"));
    }

    #[test]
    fn supports_classification() {
        assert!(supports_iroh_address("iroh+captp0:///nodeid"));
        assert!(supports_iroh_address("iroh+captp0:"));
        assert!(supports_iroh_address("iroh+captp0"));
        assert!(!supports_iroh_address("tcp://1.2.3.4:5"));
        assert!(!supports_iroh_address("http://example.com"));
    }

    #[test]
    fn derive_secret_key_is_first_32_bytes() {
        // 64 hex chars = 32 bytes.
        let node = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
        let seed = derive_iroh_secret_key(node).unwrap();
        assert_eq!(seed[0], 0x00);
        assert_eq!(seed[1], 0x11);
        assert_eq!(seed[31], 0xff);
    }

    #[test]
    fn derive_secret_key_rejects_short_input() {
        assert!(derive_iroh_secret_key("00112233").is_err());
        assert!(derive_iroh_secret_key("nothex!!").is_err());
    }
}
