@0xfeed0003deadbeef;

# L3 VatNetwork ID schemas — used by the byte-level interop tests in
# test/interop.test.js to validate that our `Provide.recipient`,
# `Accept.provision`, and `ThirdPartyCapDescriptor.id` AnyPointer
# slots are byte-compatible with what a CF / capnp-cpp peer running
# the same VatNetwork would expect.
#
# The Cap'n Proto rpc.capnp spec leaves these AnyPointer schemas
# entirely up to the application; we pick a deliberately-minimal
# OCapN-flavored shape (location + swissnum, no signatures, no
# crypto) for the test fixtures.
#
# Real interop with CF / Sandstorm would substitute their own
# schemas here. The protocol mechanics (Provide / Accept / Disembargo
# ordering, vine fallback, embargo-on-Accept) are network-shape-
# agnostic and validated separately at the wire level.

# Names a vat. `transport` is "tcp://host:port" so a recipient that
# doesn't already have a connection to this vat can dial it directly.
# Empty `transport` means "use whatever connection you already have."
struct VatLocation @0xfeed0003feed0001 {
  vatId @0 :Text;
  transport @1 :Text;
}

# What goes in `Provide.recipient`. The introducer (B) names the
# recipient (A) with its vat-id; the host (C) uses this to recognise
# the matching Accept from A.
struct TestRecipientId @0xfeed0003feed0002 {
  recipient @0 :VatLocation;
}

# What goes in `Accept.provision`. Single-use unguessable token; the
# host matches incoming Accepts to outstanding Provides by swissnum.
struct TestProvisionId @0xfeed0003feed0003 {
  swissNum @0 :Data;
}

# What goes in `ThirdPartyCapDescriptor.id`. Names where the recipient
# should dial to reach the host (C), plus the swissnum the introducer
# baked in so the recipient can present it as the Accept's provision
# without a separate handshake.
struct TestThirdPartyCapId @0xfeed0003feed0004 {
  host @0 :VatLocation;
  swissNum @1 :Data;
}
