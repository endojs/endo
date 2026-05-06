# Hardened `TextEncoder` / `TextDecoder` Vetted Shim

| | |
|---|---|
| **Created** | 2026-05-04 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

Endo's hardened-JavaScript model rests on the premise that every
intrinsic shared between fearlessly coöperating compartments is either
a powerless data constructor or has been carefully tamed.
The host's `TextEncoder` and `TextDecoder` constructors are broadly
useful (UTF-8 round-tripping for byte-oriented work, the canonical
portable alternative to Node's `Buffer`) and would be welcome
additions to the permitted intrinsics.

Unlike `URL`, the text codecs have no ambient-authority static
methods and no exposed iterator prototype, so the taming story is
straightforward: list them on `universalPropertyNames`, sample
during the existing intrinsics-collection pass, and harden.

This work targets the same source as the URL shim
([endojs/endo#2635](https://github.com/endojs/endo/issues/2635)) but
is split out as its own design because the implementation has no
overlap with the URL/SharedURL split.

## Design

### Integration: `universalPropertyNames`

`packages/ses/src/permits.js` distinguishes three relevant buckets:

- `universalPropertyNames`: powerless data and constructors that live
  on every global (the start compartment and every compartment
  created after lockdown).
- `initialGlobalPropertyNames`: the powered variants that live only
  on the start compartment (`Date`, `Error`, `RegExp`, `Math`).
- `sharedGlobalPropertyNames`: the tamed, powerless variants of those
  same names, installed on every compartment created after lockdown.

`TextEncoder` and `TextDecoder` are pure transformations between
`string` and `Uint8Array`.
They have no static side channels and no ambient-authority methods.
They belong on `universalPropertyNames`: one identity-equal
constructor across the start compartment and every shared
compartment.

### Permits table

| Constructor | Property | Disposition | Rationale |
|---|---|---|---|
| `TextEncoder` | `prototype` | ✓ | Required for instances. |
| `TextEncoder` | `prototype.encode`, `encodeInto` | ✓ | Pure. |
| `TextEncoder` | `prototype.encoding` | ✓ | Pure (always `'utf-8'`). |
| `TextDecoder` | `prototype` | ✓ | Required for instances. |
| `TextDecoder` | `prototype.decode` | ✓ | Pure. |
| `TextDecoder` | `prototype.encoding`, `fatal`, `ignoreBOM` | ✓ | Pure. |

These constructors return `Uint8Array` (already a permitted
intrinsic) or `string`.
`TextDecoder`'s constructor accepts a label and an options bag; both
are pure inputs.
No iterator prototypes are exposed.

### Sampling and degradation on hosts without the codecs

`packages/ses/src/intrinsics.js`'s `sampleGlobals(globalThis,
universalPropertyNames)` already tolerates missing properties: a
permit whose name is absent on the global is simply skipped.
The shim relies on this behavior.
On XS, where `TextEncoder` and `TextDecoder` are not defined,
lockdown proceeds without them and compartments observe their
absence exactly as they do today.

### Lockdown sequencing

The new permits hook into the existing `intrinsics.js` flow with no
new lockdown phase:

1. `getGlobalIntrinsics` collects `TextEncoder` and `TextDecoder`
   from the host global.
2. The whitelist pass walks the permits graph and prunes any
   non-listed properties.
3. `harden` is applied to the closure of permitted intrinsics.

No code outside `packages/ses/src/` changes.
The shim is fully internal to SES.

### Test plan

Tests live under `packages/ses/test/`.

1. **Presence on universals.**
   In a fresh compartment created post-lockdown,
   `compartment.evaluate('typeof TextEncoder')` returns `'function'`
   when the host provides it, `'undefined'` otherwise.
   Same for `TextDecoder`.

2. **Identity across compartments.**
   The `TextEncoder` from the start compartment and from any
   post-lockdown compartment are the same object
   (`startCompartment.globalThis.TextEncoder ===
   compartment.globalThis.TextEncoder`).

3. **Frozen.**
   `Object.isFrozen(TextEncoder)`,
   `Object.isFrozen(TextEncoder.prototype)`,
   `Object.isFrozen(TextDecoder)`,
   `Object.isFrozen(TextDecoder.prototype)` are all `true`.

4. **Round-trip semantics preserved.**
   `new TextDecoder().decode(new TextEncoder().encode('hello')) ===
   'hello'`.
   This guards against accidental over-pruning.

5. **Host without the codecs.**
   A test that deletes `globalThis.TextEncoder` and
   `globalThis.TextDecoder` before calling `lockdown()` exercises the
   degradation path.
   No throw, and the post-lockdown compartments lack the bindings.

6. **XS smoke test.**
   The existing XS test runner exercises (1) and (5) on a host that
   never provided the codecs.

### Compatibility considerations

- **Code that monkey-patches the codecs.**
  Any code that today does `TextEncoder.prototype.foo = ...` after
  `@endo/init` will throw, because the permitted intrinsics are
  frozen.
  Such code must perform its mutation before lockdown (the same rule
  that already applies to every other intrinsic).
  Note this in the SES changeset for the release that ships the
  shim.

## Dependencies

| Design | Relationship |
|---|---|
| [hardened-url-shim](hardened-url-shim.md) | Sibling design split from the same source issue.  Both add a vetted host-provided constructor to SES permits.  The two sets of permits are independent and may land in either order. |
| [base64-native-fallthrough](base64-native-fallthrough.md) | Same family of work: tame and dispatch to native intrinsics inside SES rather than re-implementing in JavaScript.  Independent. |

## Phases

### Phase 1: Permits and sampling (S)

- Extend `packages/ses/src/permits.js` with entries for `TextEncoder`
  and `TextDecoder` on `universalPropertyNames`.
- Update the whitelist pass if any new shape is required.

### Phase 2: Tests and changeset (S)

- Add the test cases enumerated in the Test Plan.
- Add a changeset under `.changeset/` describing the newly tamed
  intrinsics and the behavior on hosts without them.

### Phase 3: Downstream audit (S)

- Grep the monorepo for `Buffer.from(` and `.toString('utf` in code
  that runs under SES.
  These call sites become candidates for migration to
  `TextEncoder`/`TextDecoder` per the project's
  "prefer Uint8Array + TextEncoder/TextDecoder over Buffer"
  convention.

## Design Decisions

1. **Universal, not start-only.**
   `TextEncoder` and `TextDecoder` are powerless.
   They belong on `universalPropertyNames` (one identity-equal
   constructor across all compartments), unlike `URL` which needs an
   `initialGlobalPropertyNames` / `sharedGlobalPropertyNames` split
   to keep `createObjectURL` on the start compartment.

2. **Tame inside SES, not as an external shim.**
   Centralizing the permits avoids duplicating SES's whitelisting
   machinery in a per-package shim.

3. **No polyfill in this design.**
   XS users continue to lack `TextEncoder` and `TextDecoder`.
   A separate polyfill design can layer cleanly on top when there is
   demand.

## Prompt

```
Split out from designs/hardened-url-shim.md per PR #84 review at
designs/hardened-url-shim.md:420 ("Separating the designs would be
good.").  The TextEncoder/TextDecoder taming has no implementation
overlap with the URL/SharedURL split, so it stands alone.
```
