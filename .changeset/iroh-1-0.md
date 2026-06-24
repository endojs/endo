---
'@endo/daemon': minor
---

Upgrade the iroh network transport to `@number0/iroh` 1.0.

1.0 is a ground-up overhaul of the binding's surface: the `Iroh` node
class (`Iroh.memory`, `node`, `net`) and the inbound `protocols` table are
gone, replaced by `Endpoint.bind(options)` plus an explicit
`acceptNext()` accept loop; identity and addressing moved to
`endpoint.id()` (an `EndpointId`) and the now-synchronous
`endpoint.addr()` (an `EndpointAddr`); dialing takes an `EndpointAddr`
instance rather than a plain `NodeAddr` object; byte payloads (ALPNs,
datagrams, stream writes, close reasons) are passed as plain
`Array<number>` rather than `Uint8Array`; and `RecvStream.read` now takes
a size limit and returns the bytes read (an empty result signals EOF)
rather than filling a caller-supplied buffer. The transport, stream
adapter, heartbeat, integration test, and discovery-check script were
migrated accordingly. Behaviour is otherwise unchanged: the endpoint
still binds with iroh's n0 preset (relays + discovery) by default, so
peers remain dialable by NodeId alone.
