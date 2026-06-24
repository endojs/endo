---
'@endo/daemon': minor
---

Add a QUIC DATAGRAM heartbeat and keep-alive watchdog to the iroh
transport.

iroh's QUIC stack closes a connection after its default max idle
timeout (~2 minutes) and `@number0/iroh`'s `NodeOptions` exposes no
transport config to enable QUIC-level keep-alive, so a quiet but
healthy CapTP session over iroh was being torn down after about two
minutes of silence and surfacing as `iroh stream closed`. The
transport now emits a one-byte QUIC datagram every 30 s to reset both
endpoints' idle timers (RFC 9000 § 10.1) without disturbing the
netstring frame the CapTP reader and writer share, and arms a
keep-alive watchdog at twice the heartbeat interval so a peer that
has heartbeated and then fallen silent is presumed dead and torn down
promptly instead of waiting on the opaque QUIC idle timeout.

The watchdog is armed lazily by the peer's first inbound datagram, so
a peer that never heartbeats (an older daemon without this module) is
not torn down by the watchdog and falls back to iroh's QUIC idle
timeout exactly as before. The heartbeat is therefore safe to roll
out before every peer has it.
