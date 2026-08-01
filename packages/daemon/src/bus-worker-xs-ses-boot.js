// @ts-nocheck — XS-bundled boot script, no type-check needed.

// Entry point for the `ses_boot.js` bundle that the Rust XS runtime
// evaluates after `polyfills.js` and the host-power aliases, and
// before either the daemon or the worker bootstrap
// (`bootstrap_ses` in `rust/endo/xsnap/src/lib.rs`).  It carries the
// SES-adjacent runtime shims that the daemon and worker rely on but
// that XS does not ship natively.
//
// Today that is exactly one thing: `@endo/eventual-send/shim.js`
// installs `globalThis.HandledPromise` and registers the
// eventual-send handler API that `E(...)` and `@endo/captp` use.
// It must run after `harden` is on `globalThis`, which
// `polyfills.js` guarantees.
//
// ## This bundle does not lock down
//
// Despite the `ses_boot` name, neither this entry nor anything else
// in the boot path calls `lockdown()`: `ses` is not bundled here,
// there is no separate lockdown bundle, and the `fx_lockdown` FFI
// binding in `rust/endo/xsnap/src/ffi.rs` is declared but never
// called.  The XS realm is therefore *not* a hardened realm.
// `globalThis.harden` is `polyfills.js`'s deep-freeze, not SES's,
// and the intrinsics are unrepaired.
//
// Closing that gap is not a matter of adding an import here: the
// harden polyfill installs `Object[Symbol.for('harden')]`
// non-configurably (which by construction makes `lockdown()` fail),
// and lockdown replaces `globalThis`, which would drop the host
// aliases the bootstraps resolve their host functions through.  It
// is tracked as an explicit item in `designs/worker-rust-xs.md`
// § Known Gaps.
//
// `@endo/harden` is deliberately *not* imported.  Its default export
// selects an implementation lazily, on first call, so a bare
// side-effect import installs nothing; `polyfills.js` is what puts
// `harden` on `globalThis` and on `Object[Symbol.for('harden')]`,
// and it runs first.
//
// Bundled into `rust/endo/xsnap/src/ses_boot.js` via
// `packages/daemon/scripts/bundle-bus-worker-xs-ses-boot.mjs`; that
// artifact is generated, not committed, and
// `test/xs-worker-bundles.test.js` asserts it matches this entry.

import '@endo/eventual-send/shim.js';
