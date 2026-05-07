# NameHub Interface Unification for `EndoMount`

| | |
|---|---|
| **Created** | 2026-05-07 |
| **Updated** | 2026-05-07 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Accepted, not yet implemented |
| **Source** | PR #115 inline review comment on Open Question #6 |

## What is the Problem Being Solved?

`EndoDirectory` and the controllers it wraps (`pet-store`, `pet-sitter`,
`store-controller`) implement `NameHubInterface`
(`packages/daemon/src/interfaces.js`).
A `NameHub` is the broad capability that a host, a guest, or a
sub-directory presents to clients that walk the agent's name space:
look names up, identify them, locate them across peers, list names
and identifiers and locators, follow live changes, and (where
permitted) store, remove, move, and copy names.

`EndoMount` is the new name hub that backs scratch and external
mount points (`packages/daemon/src/mount.js`,
`MountInterface` in `interfaces.js`).
Its read surface (`has`, `list`, `lookup`, `readText`,
`maybeReadText`) is a `ReadableTree`-compatible look-alike, and its
write surface (`writeText`, `remove`, `move`, `makeDirectory`)
mirrors the directory's mutating verbs.
`MountInterface` does **not** include `identify`, `locate`,
`reverseLocate`, `reverseLookup`, `listIdentifiers`, `listLocators`,
`storeIdentifier`, `storeLocator`, `followLocatorNameChanges`, or
`maybeLookup`.

The sibling design [`filesystem-watchers.md`](filesystem-watchers.md)
adds `followNameChanges` to `EndoMount` so callers can subscribe to
its contents the way they subscribe to a directory.
Open Question #6 of that design notes that the parity exposed by
`followNameChanges` is incomplete: a consumer that walks a hub via
`identify` or `locate` (the chat inventory tree, the chat spaces
gutter, the `endo locate` and `endo list` commands, retention-path
introspection in agent guests) cannot retarget at an `EndoMount`
because those methods are absent.

The maintainer asked for a sibling design that frames the question
"what would it cost to make `EndoMount` a `NameHub`?", lays out
which methods would have to be added, what their semantics would
be, and what architectural commitments the answer carries.
The intent is not to land the change but to make the choice points
visible.

## Scope

This design covers:

- The shape of `NameHubInterface` versus `MountInterface`, method by
  method, with semantic notes for each method that is missing on the
  mount.
- The call sites that would benefit from the unification, and the
  ones that would not.
- Three structural alternatives: extend `MountInterface` to be a
  superset of `NameHubInterface`, define a narrower
  `ReadableNameHubInterface` that both already conform to, or leave
  the dispatch at the call site (the current `__getMethodNames__`
  pattern).
- Architectural concerns: mount identity, recursion through
  subdirectories that are themselves mounts, lifecycle of locators
  for filesystem entries, and the read-only attenuation surface.
- Open Questions that the maintainer must answer before any path
  forward is chosen.

Out of scope:

- Implementation of `followNameChanges` on `EndoMount`; that is
  the sibling design [`filesystem-watchers.md`](filesystem-watchers.md).
- Cross-peer file sharing.
  An `EndoMount` is local to its daemon; remote consumers reach it
  only through `lookup`, `readText`, and (after the watcher design
  lands) `followNameChanges` over CapTP.
  Locators for files would change that, and the design surfaces it
  as an Open Question rather than answering it.
- Renaming files via `move` to follow the directory's `move`-by-id
  semantics; mount `move` is already path-based (`renamePath`) and
  is not what the directory's `move` does.

## Current Shape

### `NameHubInterface` versus `MountInterface`

| Method | `NameHubInterface` | `MountInterface` | Notes |
|---|---|---|---|
| `help` | (via `DirectoryInterface`) | yes | trivial |
| `has` | yes | yes | shape compatible |
| `list` | yes | yes | shape compatible |
| `lookup` | yes | yes | shape compatible |
| `maybeLookup` | yes | no | trivial wrapper around `lookup` |
| `identify` | yes | no | requires a notion of "identifier for a file" |
| `locate` | yes | no | requires `identify` plus locator construction |
| `reverseLocate` | yes | no | requires a way to map locators back to mount paths |
| `reverseLookup` | yes | no | requires identity comparison across mount entries |
| `listIdentifiers` | yes | no | derived from `identify` |
| `listLocators` | yes | no | derived from `locate` |
| `followNameChanges` | yes | added by sibling design | shape compatible after sibling lands |
| `followLocatorNameChanges` | yes | no | requires `reverseLocate` plus the locator-stream contract |
| `storeIdentifier` | yes | no | requires "identifier" as a write target |
| `storeLocator` | yes | no | requires locator-as-write-target |
| `remove` | yes | yes | shape compatible |
| `move` | yes | yes | semantics differ (see below) |
| `copy` | yes | no | mount has no copy, by design |
| `readText`, `maybeReadText`, `writeText` | no (delegated to mount via `DirectoryInterface`) | yes | mount-only |
| `makeDirectory` | no (in `DirectoryInterface`) | yes | mount-only |
| `readOnly`, `snapshot` | no | yes | mount-only |

Two columns make `EndoMount` stand apart:

- The "identify / locate" cluster (`identify`, `locate`,
  `reverseLocate`, `reverseLookup`, `listIdentifiers`,
  `listLocators`, `storeIdentifier`, `storeLocator`,
  `followLocatorNameChanges`).
  These methods all rest on the `formula identifier` abstraction:
  every name in a `NameHub` resolves to a formula identifier (`type`
  plus `number`) that the daemon can durably reproduce, share with
  peers, and reverse-look-up.
  An entry in an `EndoMount` does not have a formula identifier:
  it is a path on disk, and its resurrected presence (the
  `EndoMountFile` exo) is allocated transiently by `lookup`, not
  durably named in the formula graph.

- The semantic difference in `move`.
  `EndoDirectory.move(fromPath, toPath)` reassigns a formula
  identifier from one pet name to another, preserving the
  identifier; cross-hub moves are implemented as
  copy-id-then-remove.
  `EndoMount.move(fromPath, toPath)` calls `filePowers.renamePath`,
  which renames the file on disk; "the same file" before and after
  is path-based, not identity-based.
  Sub-mount `move` is therefore not a `NameHubInterface` `move`
  unless the unification design picks up file-identity semantics.

### Call sites

The chat UI and CLI have three live consumers of the broader
`NameHubInterface` and one of the narrower read-and-follow
contract.

1. **`packages/chat/inventory-component.js`** (lines ~715-758):
   uses `__getMethodNames__()` to detect whether a `lookup`
   target is a `NameHub` (presence of `followNameChanges`), a
   `ReadableTree` (presence of `list` only), or a leaf.
   The wrapper builds a `nestedPowers` adapter around a
   `NameHub` target that delegates `lookup`, `remove`,
   `identify`, `locate`, and `followNameChanges` to the
   parent powers' equivalents at a longer path.
   `identify` and `locate` here are essential; the inventory
   tree displays the locator as the row's right-hand badge.

2. **`packages/chat/spaces-gutter.js`** (lines ~821-836):
   subscribes to the `spaces` directory with `followNameChanges`
   and reacts to `add` and `remove` events.
   This call site does not use `identify` or `locate`; the
   space configuration is loaded by `lookup`-then-validate.
   The watcher addition in the sibling design is sufficient
   for this call site.

3. **`packages/chat/outliner-component.js`** (lines ~233-240):
   subscribes to `followNameChanges` to power token-autocomplete.
   Like `spaces-gutter`, it does not use `identify` or `locate`.

4. **`packages/cli/src/commands/list.js`**, `inbox.js`,
   `invite.js`, `locate.js`:
   the CLI verbs that call `identify`, `locate`, and
   `reverseLocate` are presented to the user as commands against
   their host or a named sub-hub.
   They do not pass through an `EndoMount` today, but a future
   `endo locate scratch/foo.txt` (or equivalent) would only
   make sense after the unification design picks an answer for
   what a "locator for a mount entry" is.

5. **`packages/whylip`, `packages/lal`, `packages/jaine`,
   `packages/fae`, `packages/genie`** (numerous):
   these are agent setup and routing modules.
   They use `identify` / `locate` / `reverseLocate` against the
   host and the `request-form` capabilities, never against a
   mount.
   They are unlikely to retarget against a mount even after
   unification.

The high-leverage call site is the inventory tree.
A unification that lets the inventory tree render mount sub-trees
indistinguishably from directory sub-trees would close a visible
gap; the `__getMethodNames__` dispatch in inventory-component
becomes a single uniform code path.

## Design

The proposal is **not** "extend `MountInterface` to be a superset
of `NameHubInterface`".
That path drags `EndoMount` into the formula-identifier graph and
forces the locator semantics question without answering it.

The proposal is to introduce a **narrower interface**,
`ReadableNameHubInterface`, that captures the read-and-follow
intersection of `NameHub` and `EndoMount`:

```js
export const ReadableNameHubInterface = M.interface(
  'EndoReadableNameHub',
  {
    help: M.call().optional(M.string()).returns(M.string()),
    has: M.call().rest(NamePathShape).returns(M.promise()),
    list: M.call().rest(NamePathShape).returns(M.promise()),
    lookup: M.call(NameOrPathShape).returns(M.promise()),
    maybeLookup: M.call(NameOrPathShape).returns(M.any()),
    followNameChanges: M.call().returns(M.remotable()),
  },
);
```

`NameHubInterface` extends `ReadableNameHubInterface` with the
identify/locate cluster.
`MountInterface` (after the sibling watcher design lands) extends
`ReadableNameHubInterface` with the mount-specific methods
(`readText`, `writeText`, `move`, `readOnly`, `snapshot`,
`makeDirectory`).
`ReadableTreeInterface` already conforms to the read part and
gains nothing.

This split has three benefits:

- **The inventory tree's dispatch collapses.**
  The wrapper's read-and-follow path treats the target uniformly
  whenever the target's `__getMethodNames__()` includes the
  `ReadableNameHubInterface` methods; the `identify` / `locate`
  shims switch on the presence of those names in the same probe.
  Method-name detection is the runtime contract; the narrower
  interface is the documentation contract.
  Locator-badge rendering becomes "this target advertises
  `locate`" rather than "this target is a `NameHub` by tag",
  which keeps the locator-display semantics out of the mount
  story.

- **The CapTP-introspection contract is preserved.**
  `__getMethodNames__()` still returns a list of methods.
  `makeExo` provides the method names automatically (per
  `CLAUDE.md`'s "CapTP introspection" guidance).
  No new introspection surface is required; the consumer that
  cares about `identify` checks for `identify` by name.

- **The locator question is deferred, not answered.**
  An `EndoMount` does not gain `identify`, `locate`,
  `reverseLocate`, etc.
  If the project later decides that mount entries should have
  locators (so a chat user can paste `endo:/scratch/foo.txt` and
  have a peer fetch it), that is a separate design and a separate
  set of architectural commitments; the unification work does
  not block on it.

### Adapter for the call sites that already do hub-walking

After `ReadableNameHubInterface` lands, callers that walk a hub
strictly for read-and-follow do not need any new code.
They `await E(target).list()` and
`await E(target).followNameChanges()` regardless of which
interface guard the target wears.

Callers that walk for `identify` or `locate` (the inventory
tree's right-hand badge, future `endo locate` for sub-mounts)
must distinguish the two interfaces.
The recommended pattern is duck-type detection by method name:

```js
const methods = await E(target).__getMethodNames__();
if (methods.includes('locate')) {
  const locator = await E(target).locate(name);
  // …
} else {
  // EndoMount or ReadableTree: no locator concept
}
```

This pushes the dispatch to one site (the inventory wrapper) and
keeps the consumer code branch-free in the common case.
The interface is unlikely to discriminate further; new feature
families on `NameHubInterface` would advertise themselves by
method name in the same way.

### What does **not** change

- `MountInterface` keeps `move` with `renamePath` semantics.
  A unification design that wanted `move` to preserve
  formula identifiers would have to introduce file-identity
  (a content hash, an inode-tracking shim, or a content-store
  capability for files), and that question is large enough to
  warrant its own design.
- `EndoMount.lookup` continues to return `EndoMountFile` for files
  and a sub-mount for directories; neither is a `NameHub`.
  Nested hub-walking through a mount terminates at a leaf the
  way it does at a `ReadableTree`.
- `readOnly()` and `snapshot()` stay mount-specific.

## Alternatives Considered

### Make `EndoMount` a full `NameHub`

The mount adopts every `NameHubInterface` method.

- Pro: a single uniform interface across directory, host, guest,
  pet-store, mount, sub-mount.
  Inventory and CLI dispatch is one code path with no
  introspection.
- Con: opens the locator question.
  What does `E(mount).identify('foo.txt')` return?
  An ad-hoc identifier (`mount:<rootHash>:<path>`)?
  A formula identifier for an `EndoMountFile` (which is currently
  transient and not in the formula graph)?
  A locator (`endo:/<peer>/<mountId>/<path>`)?
  Each answer carries a downstream commitment to durable file
  identity, content-addressed locators, or peer fetch, none of
  which are decided.
- Con: opens the cross-hub `move` question.
  `EndoDirectory.move` from a path-in-directory to a path-in-mount
  must decide whether the formula identifier follows or whether
  the file is materialized at the mount path with a fresh
  identifier.
- Recommendation: defer.
  The locator and identity questions are too large to settle
  inside a parity-with-directory design.

### Leave the dispatch at the call site

Continue to use `__getMethodNames__` (or a new
`__getInterfaceGuard__`) to branch in the inventory tree, the
CLI, and any future consumer.

- Pro: zero interface change.
  The narrowing is implicit and the interface graph stays flat.
- Con: every consumer that walks a hub re-implements the branch.
  The inventory tree's `if (methods.includes('followNameChanges'))
  … else if (methods.includes('list'))` is the canonical instance,
  and a second consumer would copy it.
- Con: the project's CapTP-introspection convention
  (`__getMethodNames__` for capability discovery) becomes
  load-bearing for type discrimination, which is a stronger
  commitment than the convention was designed to carry.
- Recommendation: this is the do-nothing alternative; the
  preferred path narrows the interface so callers no longer
  branch.

### Three pass-through methods only

Add `identify`, `locate`, and `reverseLocate` to `EndoMount` as
trivial pass-throughs that throw `Error: not supported`.

- Pro: no interface refactor.
  `EndoMount` ostensibly satisfies `NameHubInterface`.
- Con: the methods lie.
  A consumer that holds a `NameHub` reference and calls
  `locate('foo')` against an `EndoMount` reads the throw as a
  programming error rather than as "this hub does not have
  locators".
  The static type says yes; the runtime says no.
- Con: the `NameHubInterface` guard would have to permit
  `M.error()` returns, which weakens it for every other
  implementor.
- Recommendation: rejected.
  An interface that signals "this is a `NameHub`" must satisfy
  the contract.

If, after considering the alternatives, the maintainer decides
the entire delta is "add three pass-throughs", that is a much
smaller design and could land as one PR without any sibling
document.
The author's reading is that the three-pass-through path is the
**wrong** answer because it lies about the interface; the
narrower-interface path or the do-nothing path are the two
defensible ones.

## Architectural Concerns

### Mount identity

A `NameHub` answers `identify(name)` with a stable formula
identifier.
The mount has no formula identifier for its entries today, and
giving them one is a multi-month commitment:

- The simplest approach is to mint a `mount-entry` formula type
  whose body is a `(rootMountId, pathSegments)` pair.
  These would have to be reaped when the entry disappears or the
  mount is torn down; mount-entry formulas are by their nature
  short-lived compared to other formulas in the graph.
- A content-addressed alternative
  (`mount-blob:<sha256>`) would treat file content as a CAS lookup,
  but then "identify" means something different: it's the
  identifier of the **content**, not of the **path**.
  Peers that fetch by locator would receive the content but not
  the binding to the path; consumers that pasted the locator
  expecting "the file at that path" would be surprised.
- Either way, the formula graph has to be willing to hold
  references that are invalidated by a filesystem operation
  (an external editor's `rm -f`), and the GC story has to deal
  with mount-entry formulas whose backing path no longer exists.

This question is what makes the unification design "larger than
the watcher addition" per OQ #6 of `filesystem-watchers.md`.
The proposal here defers the question to a future
`mount-entry-locators` design rather than answering it.

### Recursion through sub-mounts

`EndoMount.lookup(...path)` returns a sub-mount when the target
is a directory.
A sub-mount is itself an `EndoMount` (and after the unification
lands, a `ReadableNameHub`).
The inventory tree's expand-on-click should walk into the
sub-mount with no special case.

The narrower-interface design lands this naturally: the wrapper
`nestedPowers` is built from any `ReadableNameHub`, and
`E(subMount).list()` plus `E(subMount).followNameChanges()` plug
into the same component.
No additional interface ergonomics are required.

The full-`NameHub` alternative would also work, at the cost of
the identity question.

### Lifecycle and cleanup

`EndoMountFile` is allocated transiently by `lookup`.
It is not stored in the formula graph, so it has no GC handle.
A consumer that holds an `EndoMountFile` reference across a
daemon restart will receive a fresh exo with the same path on the
next `lookup`; identity is per-call, not per-process.

Adding `identify` to `EndoMount` would require `EndoMountFile`
(or a successor formula type) to live in the formula graph.
That is a measurable change to the daemon's memory footprint and
GC story; the cross-peer GC design
(`daemon-cross-peer-gc.md`) does not currently account for
mount-entry formulas.

The `ReadableNameHubInterface` proposal sidesteps this; mount
entries stay transient and pet-store entries stay durable, and
the dispatching consumer treats them differently because they
**are** different.

### Read-only attenuation

`EndoMount.readOnly()` returns a read-only mount that retains
read methods and rejects write methods.
A read-only `NameHub` is not a thing today.
If `MountInterface` becomes a superset of `NameHubInterface`,
`readOnly()`'s return type has to satisfy the read subset of
`NameHubInterface` plus the read mount methods, which the
narrower-interface proposal also delivers.

`storeIdentifier`, `storeLocator`, `remove`, `move`, and
`makeDirectory` are write methods; the read-only attenuation
must reject them with the same posture it currently uses for
`writeText` and `remove`.
The split-interface proposal localizes the rejection: the
read-only attenuation conforms to `ReadableNameHubInterface`
plus `ReadableMountInterface`, never to the broader writable
interfaces.

## Test Plan

Most of this design is interface plumbing; the test plan is
small.

If the narrower-interface path is taken:

1. **`MountInterface` extends `ReadableNameHubInterface`.**
   Static check: every method on `ReadableNameHubInterface` is
   present on `MountInterface` after the watcher design lands.
   Runtime check: a fresh `EndoMount` exo conforms to a
   guard-matcher for `ReadableNameHubInterface`.
2. **`NameHubInterface` extends `ReadableNameHubInterface`.**
   Same shape: a `pet-store` controller's exo conforms to the
   narrower interface.
3. **Dispatch consumer.**
   A unit test that builds a fake `ReadableNameHub` (a hub-shaped
   exo without `identify`) and asserts that the inventory
   wrapper's `nestedPowers` factory does not call `identify` on
   it.
   Pair it with a fake `NameHub` (with `identify`) and assert
   that the locator badge is rendered.

If the full-`NameHub` path is taken (not recommended), the test
plan grows to cover the identity questions and is out of scope
of this design.

## Decisions

The maintainer review of this design resolved each of the original
open questions.
The decisions are recorded here so subsequent readers see the
shape that the implementation is expected to take.

1. **Alternative chosen: the narrower interface.**
   `ReadableNameHubInterface` is introduced.
   `MountInterface` extends it.
   `NameHubInterface` extends it.
   The do-nothing alternative is rejected; the full-`NameHub`
   alternative is rejected because it would force the locator
   semantics question without answering it.
2. **`EndoMount` does not gain `identify` / `locate`.**
   The underlying entities have no formulas, so adding these
   methods would be confusing rather than clarifying.
   Mount entries stay outside the formula graph.
   A future cross-peer-fetch design may revisit this; that work
   is not blocked by, and does not block, this design.
3. **Feature detection is by method name.**
   Consumers that need to discriminate (the inventory tree's
   locator badge, future CLI verbs) probe with
   `E(target).__getMethodNames__()` and check for the presence
   of the discriminating method (`identify`, `locate`).
   The narrower interface is a documentation contract; the
   runtime check is structural.
   No new exo introspection surface (`__getInterfaceGuard__`)
   is required.
4. **Naming: `ReadableNameHubInterface`.**
   The name reads cleanly against `NameHubInterface` (the
   read-and-mutate superset) and `ReadableTreeInterface` (the
   snapshot-shaped sibling).
5. **`maybeLookup` is the primitive; `lookup` is the throwing
   wrapper.**
   The narrower interface requires both methods so callers can
   pick the form that suits the caller's error stance.
   Hubs implement either `lookup` or `maybeLookup` and derive
   the other.
   Turning a `maybeLookup` return of `undefined` into a thrown
   error is a one-line wrapper; the reverse direction (catching
   a thrown error and returning `undefined`) is more awkward,
   which is why the primitive is `maybeLookup`.
6. **`reverseLookup` does not apply to mounts.**
   `reverseLookup` stays in `NameHubInterface` and is not on
   `ReadableNameHubInterface`.
   Mount entries have per-call identity, so the directory's
   identity-based `reverseLookup` does not have a sensible
   analogue on a mount.

## Out of Scope, Future Work

- **`mount-entry-locators`.**
  If the project later decides that mount entries should be
  identifiable across peers (for example, so a chat user can
  paste `endo:/scratch/foo.txt` and have a peer fetch it),
  that is a separate design.
  The author's reading is "yes eventually, no now"; mount
  entries become first-class once cross-peer file fetch is
  desirable, and not before.
- **`link(namePath, resultName)`.**
  Lookup formulas exist, but the daemon has no first-class
  mechanism for creating a `lookup` formula the way other
  formulas are created: `lookup` does not take an optional
  `resultName` argument, and probably should not.
  A separate design for a `link(namePath, resultName)` verb
  that constructs lookup formulas as a deliberate step would
  let an operator name a path-derived presence durably,
  including (in principle) a path through a mount, without
  conflating the lookup-as-resolution operation with
  lookup-as-formula-construction.
  This design does not propose that verb.

## Dependencies

| Design | Relationship |
|--------|--------------|
| [filesystem-watchers](filesystem-watchers.md) | Sibling.  Adds `followNameChanges` to `EndoMount` and recommends this design as the next step. |
| [daemon-mount](daemon-mount.md) | Defines `EndoMount` and `MountInterface`; this design proposes refactoring `MountInterface`. |
| [daemon-256-bit-identifiers](daemon-256-bit-identifiers.md) | Defines the formula identifier surface that `identify` returns; relevant if the full-`NameHub` alternative is ever taken. |
| [daemon-content-store-gc](daemon-content-store-gc.md) | If mount entries gain locators, GC must reap mount-entry formulas; this design defers that question. |

## Prompt

> [PR #115's `filesystem-watchers.md` Open Question
> #6:](https://github.com/endojs/endo-but-for-bots/pull/115#discussion_r3198992724)
> **`NameHub` interface unification.** Should `EndoMount` adopt
> the broader `NameHubInterface` (which includes `identify`,
> `locate`, `reverseLocate`, etc.) so the same hub-walking code
> in `chat-spaces-gutter` works against both?  This is a larger
> refactor than the watcher addition and crosses into mount
> identity semantics.  Recommendation: keep this design focused
> on parity for `followNameChanges`; track hub-interface
> unification under a sibling design.
>
> Maintainer's instruction on the inline thread: "Dispatch a
> subagent to design a response to this question for later
> consideration."
