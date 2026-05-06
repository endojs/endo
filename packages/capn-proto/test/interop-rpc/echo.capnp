@0xfeed1234deadbeef;

# Minimal interface used by the live RPC interop test. A C++ server built
# against this schema (echo-server.c++) exposes the same Echo interface
# our @endo/capn-proto Node client speaks. Method codecs are derived from
# this schema on the Node side via loadSchema(...).registerInterface().

interface Echo @0xc0ffee0000000001 {
  ping @0 (msg :Text) -> (reply :Text);
  count @1 (n :UInt32) -> (twiceN :UInt32);
}
