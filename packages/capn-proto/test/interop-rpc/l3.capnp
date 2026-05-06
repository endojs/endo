@0xfeed0003deadbeef;

# L3 VatNetwork ID schemas used by the live three-party interop test
# in test/interop-l3.test.js. The Cap'n Proto `rpc.capnp` spec leaves
# the schemas of `Provide.recipient`, `Accept.provision`,
# `ThirdPartyCapDescriptor.id`, and `Return.acceptFromThirdParty.id`
# entirely up to the VatNetwork — the AnyPointer slots are application-
# defined.
#
# We pick a deliberately-minimal shape for the test:
#   - Vats are named by a `text` identifier ("A", "B", "C") plus a TCP
#     `address` so a peer that hasn't connected yet can dial.
#   - Provisions are 256-bit unguessable swissnums (matching OCapN's
#     `desc:handoff-give.giftId` shape, minus the signature).
#
# Real interop with CF / Sandstorm would substitute their own schemas
# here. The protocol mechanics — Provide / Accept / Disembargo ordering,
# vine fallback, embargo-on-Accept — are network-shape-agnostic.

# Names a vat. `transport` is "tcp://host:port" so a recipient who
# doesn't have a pre-existing connection to this vat can dial it
# directly. Empty `transport` means "use whatever connection you
# already have."
struct VatLocation @0xfeed0003feed0001 {
  vatId @0 :Text;
  transport @1 :Text;
}

# What goes in Provide.recipient. The introducer (B) names the
# recipient (A) with its vat-id; the host (C) uses this to recognize
# A's matching Accept.
struct TestRecipientId @0xfeed0003feed0002 {
  recipient @0 :VatLocation;
}

# What goes in Accept.provision. Single-use unguessable token; the host
# matches incoming Accepts to outstanding Provides by swissnum.
struct TestProvisionId @0xfeed0003feed0003 {
  swissNum @0 :Data;
}

# What goes in ThirdPartyCapDescriptor.id. Names where the recipient
# should dial to reach the host (C). For our fixture C also stamps in
# the swissnum so the recipient doesn't need a separate
# encodeProvisionForHandoff round-trip — the introducer learns the
# swissnum at Provide time and bakes it into the descriptor.
struct TestThirdPartyCapId @0xfeed0003feed0004 {
  host @0 :VatLocation;
  swissNum @1 :Data;
}
