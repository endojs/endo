# Genie slice mint: deep-harden the `env` object at the boundary

Follow-up from
[`60_genie_sandbox_review.md`](./60_genie_sandbox_review.md)
saboteur finding 6.

`packages/genie/src/sandbox/slice.js`'s `mintGenieSlice` hardens the
outer spec passed to `factory.make`, but the caller's `env` is left as
the caller supplied it.  A `Proxy`-backed `env` with per-access getters
can differentiate the value `factory.make` reads from the value the
driver eventually writes into the slice — a small but real
time-of-check / time-of-use seam under the central confinement claim
PR #148 makes.

## Plan

- [x] **Deep-harden `env` on entry to `mintGenieSlice`.**
  After
  `packages/genie/src/sandbox/slice.js:309` (`env = {},`), copy the
  caller's `env` into a fresh hardened record:

  ```js
  /** @type {Record<string, string>} */
  const safeEnv = harden({ __proto__: null, ...env });
  ```

  Replace the use of `env` further down (the `factory.make({ env })`
  call) with `safeEnv`.  The shallow spread reads every own enumerable
  property exactly once, defeating the proxy-getter attack; the
  `__proto__: null` and `harden` prevent prototype-chain or property
  drift after entry.

  Done: `packages/genie/src/sandbox/slice.js` now copies the caller's
  `env` into `safeEnv = harden({ __proto__: null, ...env })` at the
  top of `mintGenieSlice` and passes `safeEnv` (not `env`) into
  `E(sandboxFactory).make({ ... })`.  The double `@type` cast keeps
  TypeScript happy with the `__proto__: null` literal while preserving
  the `Record<string, string>` shape at the use site.

- [x] **Reject non-string values up front.**  After the spread, iterate
  the entries and throw a structured error
  (`X\`env value for ${q(key)} must be a string, got ${q(typeof value)}\``)
  on any non-string.  The factory's `M.interface()` already enforces
  this but the friendlier message names the offending key.

  Done: an `Object.entries(safeEnv)` loop immediately after the copy
  throws `agent <name>: env value for <key> must be a string, got
  <typeof>` on any non-string, naming the offending key before the
  slice-mint round-trip.

- [x] **Test: a proxy-backed `env` with a counter in the getter has the
  getter invoked exactly once.**  Mint a slice with
  `env: new Proxy({ FOO: 'bar' }, { get(t, k) { count++; return Reflect.get(t, k); } })`
  via the local-powers `dev-repl` path; assert `count === 1` after
  `mintGenieSlice` returns (and the rejected/proxy `env` object never
  flows into the factory).  Note: `mintGenieSlice` is the entry point;
  the test does **not** need a full slice mint (mock `sandboxFactory`
  is fine).

  Done: `packages/genie/test/sandbox-slice-mint.test.js` grew two new
  cases under an "`env` deep-harden at the slice boundary" heading:
  one asserts the proxy getter fires exactly once and that the spec
  passed to `factory.make` carries a frozen null-prototype record
  rather than the proxy itself; the other asserts a non-string env
  value is rejected with the agent-naming error before the factory
  is reached.  Both pass under `npx ava test/sandbox-slice-mint.test.js`.

- [x] **CLAUDE.md note** under "Spawning rules" or a new "Slice-spec
  boundary" sub-section: `env` (and any future structured input to
  `factory.make`) must be deep-copied + hardened on entry to
  `mintGenieSlice`.  Pin the rule so future additions don't reintroduce
  the gap.

  Done: `packages/genie/CLAUDE.md` gained a "Slice-spec boundary:
  deep-harden every structured input" sub-section under "Spawning
  rules" that pins the `env` discipline, shows the
  `harden({ __proto__: null, ...env })` recipe, names the TOCTOU
  attack shape it defeats, and instructs future contributors to apply
  the same copy at the `mintGenieSlice` boundary for any new
  structured input to the slice spec.

## Out of scope

- Hardening every field of `MintGenieSliceOptions` — `env` is the only
  one that takes a structured object from a potentially adversarial
  caller (the agent's configuration form).  `rootfs` is already a tagged
  union with each arm validated; `mounts` is shaped by the factory's
  guard.
