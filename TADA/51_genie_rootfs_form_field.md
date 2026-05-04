# Genie: surface a `rootfs` form field with kind-keyword validation

Sub-task carved out of [`50_genie_rootfs_config.md`](./50_genie_rootfs_config.md)
§ "Plan / Seam 1".

## Context

`packages/genie/main.js` `spawnAgent` (~lines 1201-1204) currently
hard-codes the slice's rootfs to `{ kind: 'host-bind' }` with an
inline TODO marker:

```js
/** @type {RootfsSpec} */
const rootfs = { kind: 'host-bind' };
// TODO wire this up to a form slot
```

The configuration form already exposes `backend` and `network` as
free-form string fields with companion allow-list validators
(`ALLOWED_NETWORK_PROFILES` / `isAllowedNetworkProfile`,
`ALLOWED_BACKENDS` / `isAllowedBackend`, see ~lines 101-141).
The `rootfs` field should follow the same pattern, with the added
twist that one of its accepted shapes (`oci:<ref>`) is incompatible
with one of the `backend` selectors (`bwrap`).

The sandbox surface that this form value flows into is
`RootfsSpec` in
[`packages/sandbox/src/types.d.ts`](../packages/sandbox/src/types.d.ts)
~line 143 — a tagged union of `MountCap | { kind: 'host-bind' } |
{ kind: 'minimal' } | { kind: 'oci', ref }`.
The bwrap driver rejects `{ kind: 'oci' }` with a structured error
(see [`packages/sandbox/src/drivers/bwrap.js`](../packages/sandbox/src/drivers/bwrap.js)
~lines 318-326 and 544-552), so the form needs to mirror that
constraint up front.

The `Mount`-cap (pet-name) shape is deliberately deferred to
[`52_genie_rootfs_mount_cap.md`](./52_genie_rootfs_mount_cap.md);
this task lands the keyword-only subset (`host-bind`, `minimal`,
`oci:<ref>`) so the seam exists for Seam 2 to extend.

## Deliverables

- [x] Add `ALLOWED_ROOTFS_KINDS` next to `ALLOWED_NETWORK_PROFILES`
  / `ALLOWED_BACKENDS` in `packages/genie/main.js`, containing
  `'host-bind'` and `'minimal'` (the OCI shape is `oci:<ref>` and
  is parsed separately because it carries a payload).
  Landed at `packages/genie/main.js:151` alongside
  `DEFAULT_ROOTFS_KIND`.
- [x] Add `isAllowedRootfsKind(kind)` and a `parseRootfsValue(value)`
  helper that returns one of:
  - `{ kind: 'host-bind' }` for `'host-bind'`,
  - `{ kind: 'minimal' }` for `'minimal'`,
  - `{ kind: 'oci', ref }` for `'oci:<ref>'` (with `ref` non-empty),
  - throws a structured error naming the agent and listing the
    accepted kinds when none of the above match.
  Mount-cap pet-name resolution lands in
  [`52_genie_rootfs_mount_cap.md`](./52_genie_rootfs_mount_cap.md);
  reserve the "value is none of the above" branch as the seam where
  Seam 2 will plug in instead of throwing.
  Landed at `packages/genie/main.js:160` (`isAllowedRootfsKind`)
  and `:181` (`parseRootfsValue`).  The closing `throw` is the
  Seam-2 plug-in point.
- [x] Extend the `runLoop` configuration form with a new `rootfs`
  field.  Default to `'host-bind'`.  Label it so operators can read
  the bwrap/oci asymmetry from the form description without
  cross-referencing the README.
  Landed at `packages/genie/main.js:1687-1692`; the label spells
  out the `oci:<ref>` requires-podman constraint.
- [x] Add `rootfs?: string` to the `AgentConfig` typedef in
  `spawnAgent` (~lines 217-239).
  Landed at `packages/genie/main.js:330-338`.
- [x] In `spawnAgent`, replace the hard-coded
  `const rootfs = { kind: 'host-bind' };` with the result of
  `parseRootfsValue(config.rootfs ?? 'host-bind')`.
  Place the parse alongside the existing `network` / `backend`
  validation block (~lines 1185-1199).
  Landed at `packages/genie/main.js:1307-1309`, immediately after
  the network / backend allow-list checks.
- [x] Cross-validate the parsed rootfs against the resolved backend:
  when the rootfs is `{ kind: 'oci' }` and `backend === 'bwrap'`,
  throw a structured error naming the agent and pointing at the
  fix ("set `backend` to `podman` or pick a non-oci rootfs").
  This must run **before** `E(sandboxFactory).make(...)` so the
  operator sees a friendly message instead of the bwrap driver's
  internal rejection.
  Landed via the exported `assertRootfsBackendCompatible` helper
  at `packages/genie/main.js:221-232`, called from `spawnAgent`
  at `:1313` — well before the `E(sandboxFactory).make(...)` call
  at `:1372`.
- [x] Extend the "agent ready" announcement string (search for
  `agent ready` in `main.js`) to include the rootfs kind alongside
  the existing `backend: …, network: …` fields, so operators can
  grep the daemon log to confirm which mode is in effect.
  Landed at `packages/genie/main.js:1523-1529`; the OCI shape
  renders its image ref alongside the kind (`rootfs: oci:<ref>`)
  so the daemon log captures the payload too.
- [x] Cover the new path with unit tests — a small AVA file that
  drives `parseRootfsValue` directly is sufficient; the
  cross-validation error against `backend: 'bwrap' + oci:` should
  also have a test asserting on the structured-error message.
  The integration scenario does not need to grow a new case yet
  (Seam 3 will revisit operator-facing docs and the failure-mode
  cookbook).
  Landed at `packages/genie/test/rootfs-form.test.js` (13 tests
  covering `ALLOWED_ROOTFS_KINDS`, `isAllowedRootfsKind`, every
  happy / error branch of `parseRootfsValue`, and the friendly
  bwrap-vs-oci structured-error message produced by
  `assertRootfsBackendCompatible`).

## Blocked by / blocks

- Blocks [`52_genie_rootfs_mount_cap.md`](./52_genie_rootfs_mount_cap.md)
  — Seam 2 plugs into the `parseRootfsValue` "value is none of the
  above" branch this task introduces.
- Blocks [`53_genie_rootfs_docs.md`](./53_genie_rootfs_docs.md) —
  Seam 3's README / CLAUDE.md updates document the form field this
  task adds.

## Cross-references

- `packages/genie/main.js` ~lines 1201-1204 — the TODO comment this
  task replaces.
- `packages/genie/main.js` ~lines 101-141 — pattern for
  `ALLOWED_*` allow-list + `isAllowed*` predicate.
- `packages/genie/main.js` ~lines 1185-1199 — pattern for the
  network / backend form-side validation block.
- `packages/genie/main.js` ~lines 217-239 — `AgentConfig` typedef
  the new field is added to.
- `packages/sandbox/src/types.d.ts` ~line 143 — `RootfsSpec` shape.
- `packages/sandbox/src/interfaces.js` ~line 42 — `RootfsSpecShape`
  guard the factory enforces post-form-validation.
- `packages/sandbox/src/drivers/bwrap.js` ~lines 318-326 and
  544-552 — the bwrap driver's structured rejection of `oci:`
  rootfs that this task front-runs.
