# endo_iroh

An [iroh](https://www.iroh.computer) QUIC network transport for the Rust
`endor` daemon, wire-compatible with the Node.js `@endo/daemon` iroh transport
so the two runtimes cross-connect.

"Dial keys, not IPs": a peer is reached by its Ed25519 node id and resolved
through iroh discovery and relays, over a mutually authenticated, encrypted
QUIC connection.
NAT traversal, relay fallback, and hole-punching are handled by iroh itself.

## Why a separate crate

The transport lives in its own workspace crate rather than inside `endo` for
two reasons.
It builds and tests independently of the XS engine (`xsnap`), so the iroh
logic is verifiable on any platform without the Moddable SDK.
And it keeps the iroh dependency tree out of every consumer that does not need
it — `endo` opts in by depending on this crate.

## Compatibility surface with the Node.js transport

The Node.js transport is `packages/daemon/src/networks/`, with its design in
[`packages/daemon/designs/iroh-network-design.md`](../../packages/daemon/designs/iroh-network-design.md).
Cross-connection requires byte-for-byte agreement on four things, all
mirrored here:

- **ALPN** — `endo/captp/0` ([`transport::ALPN`]).
- **Identity** — the iroh secret is derived deterministically from the
  daemon's `NodeNumber` (the first 32 bytes of the 64-hex-character Ed25519
  public key; [`address::derive_iroh_secret_key`]), so the node id is stable
  across restarts and computed identically on both runtimes.
- **Address scheme** — `iroh+captp0:///<nodeId>?relay=<url>&addr=<a>&addr=<b>`,
  with the case-sensitive node id in the URL pathname and loopback/private
  direct addresses excluded from published hints
  ([`address::build_iroh_address`] / [`address::parse_iroh_address`]).
  Addresses are built and parsed with WHATWG URL semantics, so an address
  produced by either runtime parses on the other.
- **Framing** — one bidirectional QUIC stream per connection carrying
  netstring-framed CapTP messages ([`netstring`]); by convention the dialer
  opens the stream and writes the first frame (the CapTP `hello`).

The transport only moves bytes.
The CapTP and greeter handshake run in the Endo manager, exactly as they do
over the Unix-socket bridge in `endo::socket`.

## Modules

| Module        | Responsibility                                              |
| ------------- | ----------------------------------------------------------- |
| `address`     | Pure URL/key helpers (no live endpoint); unit-tested.       |
| `netstring`   | Async `<len>:<data>,` framing over any `AsyncRead`/`Write`. |
| `transport`   | Bind an endpoint, accept/dial, frame CapTP per stream.      |

## Integration into `endor`

`endo::iroh_net` is the supervisor-side bridge, the iroh counterpart of
`endo::socket`.
The manager asks the supervisor to host an iroh device with a `listen-iroh`
control message carrying the daemon's `NodeNumber`; the supervisor binds the
endpoint, replies `listening-iroh` with the published address, and bridges
each inbound peer to the manager as `connect` / `deliver` / `disconnect`
envelopes — identical to the Unix-socket bridge.
This lets a Node.js Endo daemon dial a Rust `endor` (and, with the
manager-side proxy network that drives these control messages, vice versa).

## The `endo-iroh` harness

`endo-iroh` is a tiny binary for manually verifying transport-layer
cross-connection.
It speaks the same ALPN, address scheme, and netstring framing as the daemon,
but does not run CapTP — it just frames bytes — so it exercises the iroh
plumbing end to end, not the full CapTP handshake.

```sh
# Terminal A — print a dialable address and echo frames:
cargo run -p endo_iroh --bin endo-iroh -- listen
# Terminal B — dial it and round-trip a frame:
cargo run -p endo_iroh --bin endo-iroh -- dial 'iroh+captp0:///<nodeId>...' 'hello'
```

Add `--local` to both to bind without relay/discovery (minimal preset) for
same-host runs; the printed address then carries direct-address hints.
By default the n0 preset is used, so `listen` is dialable by node id alone
across networks, given outbound access to iroh's relay and discovery services.

## Testing

```sh
# Unit tests (pure logic, no network):
cargo test -p endo_iroh --lib

# Integration test — two real iroh nodes, one process (opt-in):
ENDO_IROH_INTEGRATION=1 cargo test -p endo_iroh --test integration -- --nocapture
```

The integration test is gated behind `ENDO_IROH_INTEGRATION=1`, mirroring the
Node.js `iroh-network.test.js`, because it binds real QUIC sockets; the pure
logic it exercises is also covered by the unit tests.
