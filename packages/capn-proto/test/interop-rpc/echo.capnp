@0xfeed1234deadbeef;

# Schema used by the live RPC interop tests in test/interop-rpc.test.js
# and test/interop-rpc-multi.test.js. A C++ server built against this
# schema (echo-server.c++) exposes the same TestSuite interface our
# @endo/capn-proto Node clients speak. Each Node test uses
# `loadSchema(...).registerInterface(registry, name)` to derive method
# codecs at runtime; the wire format is byte-compatible with the C++
# implementation.
#
# A single TestSuite interface aggregates every test surface — Cap'n
# Proto's RPC bootstrap returns one capability, and avoiding multiple
# inheritance on the C++ side keeps `Capability::Server::dispatchCall`
# unambiguous.

# Per-instance state lives on a separate Counter interface so we can
# verify (a) that each `newCounter()` returns a fresh server-side
# object, and (b) that two separate Node clients each get independent
# Counter state — the expected two-party-RPC isolation property.
interface Counter @0xc0ffee0000000002 {
  inc @0 () -> (value :UInt32);
  get @1 () -> (value :UInt32);
}

interface TestSuite @0xc0ffee0000000001 {
  # Trivial echo + arithmetic. Smallest-possible Call/Return interop.
  ping @0 (msg :Text) -> (reply :Text);
  count @1 (n :UInt32) -> (twiceN :UInt32);

  # Returns a fresh Counter capability; lets us exercise pipelined
  # calls on a returned cap (`E(E(remote).newCounter()).inc()` without
  # an intermediate await).
  newCounter @2 () -> (counter :Counter);

  # Cap-as-argument exerciser: the server invokes target.ping(msg) and
  # returns whatever `target` returned. Used in the multi-client tests
  # to verify a Node-supplied cap can be invoked by the C++ peer.
  callBack @3 (target :TestSuite, msg :Text) -> (reply :Text);
}
