# Genie: hoist Mount-cap method-set validation into a helper and pin the rejection surface

Follow-up from
[`60_genie_sandbox_review.md`](./60_genie_sandbox_review.md):
juror finding on `main.js:1125` / `main.js:1223` (duplicated validation
block) plus saboteur finding 3 (the `__getMethodNames__()` check is the
*only* authentication on a pet-name Mount cap and the downstream
`provideHostPath` rejection should be pinned).

## Plan

- [x] **Extract `assertIsMountCap(cap, { agentName, role })`.**
  Helper lives in `packages/genie/src/sandbox/slice.js` alongside
  `MOUNT_REQUIRED_METHODS = ['readText', 'writeText', 'makeDirectory',
  'has', 'list']`.  Returns the cap on success; role-aware error
  wording ("workspace pet name" / "rootfs pet name") preserved.

- [x] **Update both call sites.**  `packages/genie/main.js`'s workspace
  pet-name branch (~line 1131) and rootfs pet-name branch (~line 1222)
  both call `await assertIsMountCap(cap, { agentName, role, petName })`.

- [x] **Pin saboteur finding 3 with a test.**
  `packages/daemon/test/endo.test.js` test
  `'provideHostPath rejects a spoof that passes the genie shape gate'`
  (~line 4344) mints a real Mount, hand-rolls a `makeExo` spoof with
  the exact method set the genie probes for, asserts the shape probe
  would pass it, and pins the identity gate's
  `not a daemon-minted mount` rejection.

- [x] **Cross-check the dev-repl side.**
  `packages/genie/test/local-sandbox-powers.test.js` test
  `'assertIsMountCap is a shape gate; provideHostPath is the identity
  gate'` (~line 128) drives the helper directly against a spoof and
  pins the local powers' `not a local-minted mount` rejection plus the
  symmetric "wrong shape" friendly diagnostic.

- [x] **DESIGN / CLAUDE note.**  `packages/genie/CLAUDE.md` §
  "Capabilities the genie guest receives" documents the two-layer gate
  (shape gate via `assertIsMountCap`, identity gate via
  `provideHostPath` — `not a daemon-minted mount` /
  `not a local-minted mount`) and § "`rootfs` form field — four shapes
  plus a backend cross-check" cross-references the same layering for
  the rootfs pet-name arm.  The pin tests are cited in both sections.

## Out of scope

- Replacing `__getMethodNames__()` with a runtime brand or a CapTP
  identity probe; the existing layering (shape gate then identity
  gate) is sufficient once the rejection is pinned.
- Hoisting the helper into `@endo/daemon` for reuse — the daemon has
  its own identity gate (`provideHostPath`) and does not need a
  shape gate.
