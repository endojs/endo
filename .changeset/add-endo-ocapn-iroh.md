---
'@endo/ocapn-iroh': minor
---

Add `@endo/ocapn-iroh`, an iroh 1.0 QUIC netlayer for `@endo/ocapn`.
"Dial keys, not IPs": the OCapN designator is the peer's iroh
`EndpointId`, dialed through iroh discovery and relays into a mutually
authenticated, encrypted QUIC connection carrying netstring-framed OCapN
messages under the `ocapn/netstring/0` ALPN. Session establishment is
the OCapN client's standard `op:start-session` handshake, and a QUIC
datagram heartbeat keeps quiet sessions alive across iroh's idle
timeout. The `@number0/iroh` native binding is an optional dependency,
imported dynamically and injectable for testing.
