@0xfeed0003deadbeef;

# L3 application-defined types — used by the byte-level interop tests in
# test/interop.test.js and the live L3 interop test in
# test/interop-l3.test.js to populate the AnyPointer slots that
# rpc.capnp 2.0-dev defines as `:ThirdPartyToContact`,
# `:ThirdPartyToAwait`, and `:ThirdPartyCompletion`.
#
# rpc.capnp leaves these schemas application-defined; this file picks an
# OCapN-flavored shape (location + swissnum, no signatures, no crypto)
# minimal enough to drive the C++ test fixture's custom VatNetwork.
#
# Real interop with CF / Sandstorm would substitute their own schemas
# here. The protocol mechanics (Provide / Accept / Disembargo ordering,
# vine fallback, embargo-on-Accept) are network-shape-agnostic and
# validated separately at the wire level.

# Names a vat. `transport` is "tcp://host:port" so a recipient that
# doesn't already have a connection to this vat can dial it directly.
# Empty `transport` means "use whatever connection you already have."
struct VatLocation @0xfeed0003feed0001 {
  vatId @0 :Text;
  transport @1 :Text;
}

# 2.0-dev: `Provide.recipient :ThirdPartyToAwait`. The introducer (B)
# tells the host (C) which vat will eventually pick this up, plus the
# unguessable swissnum C uses to match the matching Accept.
struct TestThirdPartyToAwait @0xfeed0003feed0002 {
  recipient @0 :VatLocation;
  swissNum @1 :Data;
}

# 2.0-dev: `Accept.provision :ThirdPartyCompletion`. A presents this to
# the host so the host can match it back to the awaiting Provide. Just
# the swissnum — no other identifying info needed.
struct TestThirdPartyCompletion @0xfeed0003feed0003 {
  swissNum @0 :Data;
}

# 2.0-dev: `ThirdPartyCapDescriptor.id :ThirdPartyToContact`. Names where
# A should dial to reach the host (C), plus the swissnum the introducer
# baked in so A can present it back to C in the Accept's provision
# without a separate handshake.
struct TestThirdPartyToContact @0xfeed0003feed0004 {
  host @0 :VatLocation;
  swissNum @1 :Data;
}

# Pre-2.0 type-name aliases preserved for the existing byte-level
# interop tests. These are wire-compatible with the 2.0-dev names above
# (same field offsets and types); the rename was just a logical
# clarification in the upstream spec. Tests that only need a structured
# AnyPointer payload — not the full L3 plumbing — can keep using these.
struct TestRecipientId @0xfeed0003feed0102 {
  recipient @0 :VatLocation;
}
struct TestProvisionId @0xfeed0003feed0103 {
  swissNum @0 :Data;
}
struct TestThirdPartyCapId @0xfeed0003feed0104 {
  host @0 :VatLocation;
  swissNum @1 :Data;
}
