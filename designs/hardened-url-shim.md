# Hardened `URL` Vetted Shim

| | |
|---|---|
| **Created** | 2026-05-04 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

Endo's hardened-JavaScript model rests on the premise that every
intrinsic shared between fearlessly coöperating compartments is either
a powerless data constructor or has been carefully tamed.
The host's `URL` constructor and its companion `URLSearchParams` are
broadly useful (parsing, normalization, query manipulation) and would
be welcome additions to the permitted intrinsics, but a naive
`harden(URL)` is not safe.

Two specific hazards:

1. **Iterator prototypes leak past the SES intrinsic graph.**
   `URLSearchParams.prototype.entries`, `.keys`, `.values`, and the
   default `[Symbol.iterator]` return iterator objects whose
   `[[Prototype]]` is `%URLSearchParamsIteratorPrototype%`.
   That prototype is reachable only by walking an instance.
   It is not on `globalThis`, not in `permits.js`, and not visited by
   `harden`'s transitive walk unless we explicitly seed it.
   A compartment that gets a single `URLSearchParams` object can mutate
   the iterator prototype and thereby influence every other
   compartment's iteration over a `URLSearchParams`.

2. **`URL.createObjectURL` and `URL.revokeObjectURL` are ambient
   authority.**
   In a browser they mint and revoke handles into the document's
   blob registry, which is observable by every other realm in the
   page.
   They are exactly the kind of side-channel that ocap discipline
   forbids.
   They must be removed from the constructor before any compartment
   sees it.

The fix is to add `URL` and `URLSearchParams` to the SES permits as
a vetted shim, with explicit permits for the search-params iterator
prototype, and a Date-style split that keeps the dangerous static
methods on the start compartment only.
On hosts that do not provide `URL` (notably XS), the shim is a no-op
so Endo's portability story is preserved.

This work targets endojs/endo issue
[#2635](https://github.com/endojs/endo/issues/2635).
The companion `TextEncoder` / `TextDecoder` taming is split into a
sibling design at
[`hardened-text-codecs-shim.md`](./hardened-text-codecs-shim.md);
it has no implementation overlap with the URL work.

## Design

### Integration: full `URL` on the start compartment, tamed `%SharedURL%` on shared compartments

`packages/ses/src/permits.js` distinguishes three relevant buckets:

- `universalPropertyNames`: powerless data and constructors that live
  on every global (the start compartment and every compartment created
  after lockdown).
- `initialGlobalPropertyNames`: the powered variants that live only on
  the start compartment (`Date`, `Error`, `RegExp`, `Math`).
- `sharedGlobalPropertyNames`: the tamed, powerless variants of those
  same names, installed on every compartment created after lockdown.

`URL.createObjectURL` and `URL.revokeObjectURL` are ambient authority
that the start compartment can reasonably keep (a host application
often needs to mint blob URLs from its own data) but which shared
compartments must not see.
This is exactly the `Date`-style split: the start compartment keeps
the host's full `URL`; every shared compartment receives a tamed
constructor under the same name `URL` that omits the dangerous
static methods.
SES names the tamed intrinsic `%SharedURL%`, mirroring the existing
`%SharedSymbol%`, `%SharedDate%`, `%SharedError%`, and `%SharedRegExp%`
intrinsics on `sharedGlobalPropertyNames`.

The chosen integration is therefore:

- **`%URL%` on `initialGlobalPropertyNames`** (start compartment only),
  bound to `globalThis.URL`.
  Full host shape, including `createObjectURL` and `revokeObjectURL`.
  Hardened in place; the static methods themselves remain callable.
- **`%SharedURL%` on `sharedGlobalPropertyNames`** (every shared
  compartment), bound to `globalThis.URL`.
  The constructor permits omit `createObjectURL` and
  `revokeObjectURL`.
  `%URL%` and `%SharedURL%` share the same `prototype` value so that
  an instance constructed in either compartment is `instanceof URL`
  in either compartment.

Consumer code in any compartment continues to write `new URL(...)`;
the start compartment's `URL` is the powered binding and every shared
compartment's `URL` is the tamed binding.

This mirrors the way SES handles `Date`: the powered constructor
lives on `initialGlobalPropertyNames`, the powerless variant on
`sharedGlobalPropertyNames`, both produced from the same host
intrinsic during the intrinsics-collection pass.

#### Lockdown opt-in to conflate `%URL%` and `%SharedURL%`

A class of embeddings has no use for `createObjectURL` even on the
start compartment (server-side, XS, an Electron main process that
will never load a `Blob`).
For these embeddings, an opt-in lockdown option collapses the split:

```js
lockdown({
  // ... other options ...
  urlBlobMethods: 'remove',  // default: 'keepOnInitialGlobal'
});
```

When `urlBlobMethods: 'remove'`, the start compartment's `URL` is
also bound to `%SharedURL%`, and `createObjectURL` /
`revokeObjectURL` are removed everywhere.
This restores the simpler "`URL === URL` across compartments" model
for embeddings that want it.

The default is `'keepOnInitialGlobal'` because removing a
host-provided method from the start compartment is more disruptive
than introducing a second bound name.

#### Cross-compartment `instanceof`

Because `%URL%` and `%SharedURL%` share the same `prototype` value,
a URL constructed on the start compartment and passed to a shared
compartment satisfies `x instanceof URL` there (where `URL` is the
shared compartment's tamed binding).
A URL constructed in a shared compartment and passed back to the
start compartment likewise satisfies `x instanceof URL` there
(where `URL` is the start compartment's powered binding).

This is an **open question**: shared identity at the prototype level
is the simplest fix, but it means the two constructor functions are
distinct values, and any code that compares `Foo.constructor === URL`
will get a different answer depending on where the value originated.
The alternative is to make `%URL%` and `%SharedURL%` distinct
prototype chains and accept that `instanceof URL` is unreliable
across the boundary; that pushes the burden onto cross-compartment
helper libraries.
Recommend the shared-prototype approach unless the maintainer prefers
the strict separation.

### Permits table

The permits entry models `%URL%`, `%SharedURL%`, and
`%URLSearchParams%` as ordinary constructors with an explicit set
of permitted properties.
Anything not listed is removed by SES's whitelisting pass.

Below, columns mark which properties are kept (✓), removed (✗), or
require special treatment (★).

#### `%URL%` (start compartment, bound to `globalThis.URL`)

| Property | Disposition | Rationale |
|---|---|---|
| `prototype` | ✓ | Required for instances; the same identity as `%SharedURL%.prototype`. |
| `parse` (static) | ✓ | Pure parsing returning a URL or `null`. |
| `canParse` (static) | ✓ | Pure predicate. |
| `createObjectURL` | ✓ | Ambient blob-registry authority; the start compartment may legitimately need it. |
| `revokeObjectURL` | ✓ | Companion to `createObjectURL`. |

#### `%SharedURL%` (every shared compartment, bound to `globalThis.URL`)

| Property | Disposition | Rationale |
|---|---|---|
| `prototype` | ✓ | Required for instances; the same identity as `%URL%.prototype`. |
| `parse` (static) | ✓ | Pure parsing returning a URL or `null`. |
| `canParse` (static) | ✓ | Pure predicate. |
| `createObjectURL` | ✗ | Ambient blob-registry authority; not safe to share. |
| `revokeObjectURL` | ✗ | Companion to `createObjectURL`. |

When the lockdown opt-in `urlBlobMethods: 'remove'` is set, the
start compartment's `URL` uses the `%SharedURL%` permits row
instead.

The shared `prototype` permit lists the standard accessors (`href`,
`origin`, `protocol`, `username`, `password`, `host`, `hostname`,
`port`, `pathname`, `search`, `searchParams`, `hash`) and the
standard methods (`toString`, `toJSON`).
All are pure and powerless after the constructors are tamed.

#### `URLSearchParams`

| Property | Disposition | Rationale |
|---|---|---|
| `prototype` | ✓ | Required for instances. |
| `prototype.append`, `delete`, `get`, `getAll`, `has`, `set`, `sort`, `toString`, `size` | ✓ | Pure operations on an own-data structure. |
| `prototype.forEach`, `entries`, `keys`, `values`, `[Symbol.iterator]` | ★ | Pure, but each returns an instance of `%URLSearchParamsIteratorPrototype%`; see below. |

#### `%URLSearchParamsIteratorPrototype%` (the hidden one)

This intrinsic has no name on `globalThis`.
It is reachable only as `Object.getPrototypeOf(new URLSearchParams().entries())`.
The shim must:

1. Sample it during the intrinsics-collection pass by constructing a
   throwaway `URLSearchParams`, calling `.entries()` on it, and
   walking up to its prototype.
2. Add it to the permitted-intrinsics graph under a synthetic name
   (e.g. `%URLSearchParamsIteratorPrototype%`).
3. List the standard iterator methods (`next`, `return`) and the
   `[Symbol.toStringTag]` value (`'URLSearchParams Iterator'` in
   current host implementations) as permitted properties so the
   whitelist pass does not strip them.
4. Be hardened along with the rest of the intrinsics.

The same pattern is already used in SES for the analogous
`%IteratorPrototype%` and `%ArrayIteratorPrototype%`; the URL search
params iterator simply joins that list.

### Sampling and degradation on hosts without `URL`

`packages/ses/src/intrinsics.js`'s `sampleGlobals(globalThis,
universalPropertyNames)` already tolerates missing properties: a
permit whose name is absent on the global is simply skipped.
The shim relies on this behavior.
On XS, where `URL` and `URLSearchParams` are not defined, lockdown
proceeds without them and compartments observe their absence exactly
as they do today.

The iterator-prototype sampling step must guard against the
`URLSearchParams` constructor being absent.
A small helper:

```js
const sampleHiddenIntrinsics = globalObject => {
  const intrinsics = { __proto__: null };
  if (typeof globalObject.URLSearchParams === 'function') {
    const params = new globalObject.URLSearchParams();
    intrinsics['%URLSearchParamsIteratorPrototype%'] =
      Object.getPrototypeOf(params.entries());
  }
  return intrinsics;
};
```

The result merges into the intrinsics map before the whitelist pass.

### Lockdown sequencing

The new permits and the iterator-prototype sampler hook into the
existing `intrinsics.js` flow with no new lockdown phase:

1. `getGlobalIntrinsics` collects `URL` and `URLSearchParams` from
   the host global.
2. The intrinsics-installation step routes the host's `URL` into
   the `%URL%` intrinsic on `initialGlobalPropertyNames` (start
   compartment, bound to `globalThis.URL`) and into a second
   intrinsic `%SharedURL%` on `sharedGlobalPropertyNames`
   (post-lockdown compartments, also bound to `globalThis.URL`).
   Both intrinsics reference constructor functions that share the
   same `prototype` value.
3. `getAnonymousIntrinsics` (already the home of `%IteratorPrototype%`,
   `%AsyncIteratorPrototype%`, etc.) gains a call to
   `sampleHiddenIntrinsics` for the URL search-params iterator.
4. The whitelist pass walks the permits graph.
   The `%SharedURL%` permits row removes `createObjectURL` and
   `revokeObjectURL` from the shared binding.
   The `%URL%` permits row leaves them in place on the start
   compartment unless the `urlBlobMethods: 'remove'` lockdown option
   is set, in which case the `%SharedURL%` permits row applies to
   both bindings and the start compartment also loses the methods.
5. `harden` is applied to the closure of permitted intrinsics, which
   now includes the URL search-params iterator prototype.

No code outside `packages/ses/src/` changes.
The shim is fully internal to SES.

### Comparison to the original `@endo/url` package proposal

The earlier sketch proposed an `@endo/url` package with a
`shim.js` for `@endo/init`.
Each package consumer would opt in by importing the shim before
calling `lockdown()`.
That approach has two drawbacks:

1. **Opt-in fragmentation.**
   Some compartments would have `URL`, others would not, depending on
   whether the shim was loaded before lockdown.
   Library authors cannot rely on `URL` being present in the
   compartments their code runs in.

2. **Out-of-band intrinsic.**
   A `URL` installed by `@endo/url/shim.js` is not visited by
   `intrinsics.js`'s permits graph, so the iterator-prototype
   problem must be solved inside the shim with bespoke code that
   duplicates SES's whitelisting machinery.

Folding the work into the SES intrinsics pipeline (`%URL%` on
`initialGlobalPropertyNames`, `%SharedURL%` on
`sharedGlobalPropertyNames`, both bound to `globalThis.URL`) solves
both: every compartment in every embedding gets the appropriate
constructor, and the existing permits/whitelist pipeline does the
taming in one place.

The cost is a small, host-dependent contribution to the SES bundle
and to lockdown time, but the contribution is paid only when the
host actually provides `URL`.

A residual case for an `@endo/url` package remains: a polyfill for
hosts (XS) that want a JavaScript `URL` implementation.
That is a separate design and out of scope here.
The vetted shim and a future polyfill compose: the polyfill installs
`URL` on `globalThis` before lockdown, and the SES permits then tame
it like any other host-provided `URL`.

### Test plan

Tests live under `packages/ses/test/`.

1. **Presence on the start compartment.**
   `globalThis.URL` is a function after lockdown.
   `'createObjectURL' in URL` and `'revokeObjectURL' in URL` are
   both `true` (default `urlBlobMethods: 'keepOnInitialGlobal'`).

2. **Presence on shared compartments.**
   In a fresh compartment created post-lockdown,
   `compartment.evaluate('typeof URL')` returns `'function'` when the
   host provides `URL`, `'undefined'` otherwise.
   Same for `URLSearchParams`.
   `'createObjectURL' in compartment.globalThis.URL` is `false`.

3. **Shared prototype across compartments.**
   The start compartment's `URL.prototype` is `===` the shared
   compartment's `URL.prototype`.
   An instance constructed in the start compartment satisfies
   `instanceof URL` in a shared compartment, and vice versa.

4. **Lockdown opt-in `urlBlobMethods: 'remove'`.**
   When `lockdown({ urlBlobMethods: 'remove' })` is called,
   `'createObjectURL' in URL` and `'revokeObjectURL' in URL` are
   both `false` on the start compartment.
   The start compartment's `URL` and a shared compartment's `URL` are
   `===` (single conflated binding).

5. **Frozen.**
   `Object.isFrozen(URL)`, `Object.isFrozen(URL.prototype)`,
   `Object.isFrozen(URLSearchParams.prototype)`, and
   `Object.isFrozen(Object.getPrototypeOf(new
   URLSearchParams().entries()))` are all `true`.

6. **Iterator-prototype tampering rejected.**
   `Object.getPrototypeOf(new URLSearchParams().entries()).next = () => {}`
   throws (frozen prototype).
   A second compartment iterating its own `URLSearchParams` is
   unaffected.

7. **Round-trip semantics preserved.**
   `new URL('http://example.com/a?b=1').searchParams.get('b') === '1'`.
   This guards against accidental over-pruning.

8. **Host without `URL`.**
   A test that deletes `globalThis.URL` and `globalThis.URLSearchParams`
   before calling `lockdown()` exercises the degradation path.
   No throw, and the post-lockdown compartments lack the bindings.

9. **XS smoke test.**
   The existing XS test runner exercises (2) and (8) on a host that
   never provided `URL`.

### Compatibility considerations

- **Code that monkey-patches `URL`.**
  Any code that today does `URL.foo = ...` or
  `URL.prototype.bar = ...` after `@endo/init` will throw, because
  the permitted intrinsics are frozen.
  Such code must perform its mutation before lockdown (the same rule
  that already applies to every other intrinsic).
  Note this in the SES changeset for the release that ships the
  shim.

- **Code that uses `URL.createObjectURL`.**
  The browser's blob-URL workflow is broken in any compartment whose
  `URL` came from SES.
  Code that needs `createObjectURL` must obtain it from the host
  before lockdown and explicitly endow a wrapper into the
  compartment that needs it.
  This is the explicit goal: the dangerous method is moved from
  ambient authority to a deliberate capability.

- **Type definitions.**
  The TypeScript definitions for `URL` shipped by `lib.dom.d.ts`
  declare `createObjectURL` and `revokeObjectURL` as static methods.
  Endo packages that compile against `lib.dom.d.ts` and reference
  these methods would compile but fail at runtime under SES.
  No fix in this design; downstream packages should add their own
  capability shims.

- **`URLSearchParams` constructor accepting iterables.**
  The constructor accepts a sequence of `[name, value]` pairs.
  If a compartment passes a malicious iterable whose `next()` mutates
  shared state, the URL implementation is responsible for not amplifying
  the mischief.
  All major host implementations consume the iterable strictly and
  store only string copies, so this is not a new attack surface, but
  worth noting in the test plan as a check.

## Related work

These designs are similar in spirit, not blocking dependencies.

| Design | Relationship |
|---|---|
| [base64-native-fallthrough](base64-native-fallthrough.md) | Same family of work: tame and dispatch to native intrinsics inside SES rather than re-implementing in JavaScript. |
| [hex-package](hex-package.md) | Same family: ponyfill-shim pattern around a TC39 native. The URL shim is the SES-internal analogue of these external ponyfills. |

## Phases

### Phase 1: Permits and sampling (S)

- Extend `packages/ses/src/permits.js` with entries for `%URL%` (on
  `initialGlobalPropertyNames`), `%SharedURL%` (on
  `sharedGlobalPropertyNames`, bound to `globalThis.URL` in shared
  compartments), `%URLSearchParams%`, and
  `%URLSearchParamsIteratorPrototype%`.
- Plumb the `urlBlobMethods` lockdown option into the permits
  selection so `'remove'` swaps the start compartment's `%URL%` row
  for the `%SharedURL%` row.
- Extend `packages/ses/src/get-anonymous-intrinsics.js` (or the
  closest equivalent) to sample the iterator prototype.
- Update the whitelist pass if any new shape is required.

### Phase 2: Tests and changeset (S)

- Add the test cases enumerated in the Test Plan.
- Add a changeset under `.changeset/` describing the newly tamed
  intrinsics, the `urlBlobMethods` lockdown option, the removed
  methods on shared compartments, and the behavior on hosts without
  `URL`.

### Phase 3: Downstream audit (S)

- Grep the monorepo for `URL.createObjectURL` and
  `URL.revokeObjectURL`.
  None should remain in code that runs under SES.
- Grep for `new URL(` in code that currently runs in compartments
  without `URL`. These call sites become enabled by this change and
  may be candidates for simplification (e.g. dropping bespoke URL
  parsers).

## Design Decisions

1. **`%URL%` on the start compartment, `%SharedURL%` on shared compartments.**
   The blob-URL static methods are useful authority a host application
   can legitimately keep on the start compartment, but they must not
   reach shared compartments.
   The `Date`-style split (powered binding on
   `initialGlobalPropertyNames`, powerless variant on
   `sharedGlobalPropertyNames`) is the smallest change that captures
   both intents.
   Both intrinsics are bound to `globalThis.URL` so consumer code is
   identical in either compartment.
   The `%SharedURL%` name follows the SES precedent set by
   `%SharedSymbol%`, `%SharedDate%`, `%SharedError%`, and
   `%SharedRegExp%`.

2. **Lockdown opt-in to conflate `%URL%` and `%SharedURL%`.**
   Embeddings that have no use for blob URLs even on the start
   compartment can pass `lockdown({ urlBlobMethods: 'remove' })` to
   collapse the split, restoring the simpler "single `URL` binding
   shared by all compartments" model.
   The default keeps the host-provided start-compartment shape.

3. **Tame inside SES, not as an external shim.**
   The iterator-prototype hazard is an SES whitelisting concern.
   Centralizing it in `permits.js` avoids duplicating the
   whitelisting machinery in a per-package shim.

4. **`TextEncoder` / `TextDecoder` split into a sibling design.**
   The text codecs share the same source issue but have no
   implementation overlap with the `%URL%` / `%SharedURL%` split.
   They live in
   [`hardened-text-codecs-shim.md`](./hardened-text-codecs-shim.md)
   so each design can land independently.

5. **No polyfill in this design.**
   XS users continue to lack `URL`.
   A separate `@endo/url` polyfill design can layer cleanly on top
   when there is demand.

6. **Permit `URL.parse`, `URL.canParse`, and the iterator prototype's
   `[Symbol.toStringTag]`.**
   The static parse helpers are pure and admitted on every host that
   provides them; absence on older hosts is handled by the same
   skip-when-missing pass that handles `URL` itself.
   The iterator prototype's `[Symbol.toStringTag]` is permitted so
   `Object.prototype.toString.call(new URLSearchParams().entries())`
   returns the host-defined tag rather than `'[object Object]'`.

7. **Bundle-size impact is negligible.**
   The contribution is small (tens of lines of permits for the
   `%URL%` / `%SharedURL%` pair plus one iterator-prototype sampler).
   The blob-methods opt-in is a single boolean check.
   No bundle-size measurement is required before landing.

## Open questions

1. **What is the right name for the synthetic intrinsic?**
   `%URLSearchParamsIteratorPrototype%` mirrors the
   `%IteratorPrototype%` convention.
   If a shorter or differently spelled name is preferred (for
   consistency with how SES names other hidden intrinsics), say so.

2. **Cross-compartment `instanceof` for `%URL%` and `%SharedURL%`.**
   The default proposal makes the two intrinsics share a single
   `prototype` value so an instance crosses the boundary and still
   satisfies `instanceof URL` on either side.
   The cost is that `Foo.constructor === URL` returns a different
   answer depending on where the value originated.
   The alternative is two distinct prototype chains; that pushes the
   burden onto cross-compartment helper libraries.
   Confirm the shared-prototype direction or call out the trade-off
   to revisit.

## Prompt

```
You are entering the **designer** role to author a design document for
hardening the URL constructor under SES, then open a PR carrying that
document.

## Source issue

`endojs/endo` issue **#2635** "Hardened URL vetted shim" by kriskowal:
https://github.com/endojs/endo/issues/2635

The issue body proposes adding `URL`, `TextEncoder`, `TextDecoder`,
and other common JavaScript platform features to the SES shared
intrinsics treated by Lockdown. Place them in
`universalPropertyNames` (not `sharedGlobalPropertyNames`) so the same
`URL` constructor exists in the start compartment and shared
compartments. Critical security points:

- `harden(URL)` is insufficient because some methods return objects
  with prototypes outside the shared intrinsics (notably
  `URLSearchParams` iterators).
- Dangerous methods like `createObjectURL` and `revokeObjectURL` must
  be deleted to maintain ocap discipline.
- XS does not provide `URL`; Agoric on XS has no plans to introduce
  one. The shim must degrade safely on platforms without `URL`.
- The earlier proposal sketched an `@endo/url` package with a
  `shim.js` for `@endo/init`. The issue's current direction is to
  fold this into SES via `universalPropertyNames`, but the design
  should evaluate both approaches.

The user (in this dispatch) framed it as: "subsuming URL in SES so we
can tame it, removing dangerous methods for ocap discipline."

## Output

A single new file at `designs/hardened-url-shim.md` covering the
universalPropertyNames integration, permits/property-removal table
for URL and related constructors, the URLSearchParams
iterator-prototype concern, the XS-degradation path, test plan,
compatibility considerations, brief comparison to the original
@endo/url package proposal, and open questions.
```

(Subsequently split per PR #84 review: the `%URL%` / `%SharedURL%`
bucket-split restructure landed here; `TextEncoder`/`TextDecoder`
moved to
[`hardened-text-codecs-shim.md`](./hardened-text-codecs-shim.md).)
