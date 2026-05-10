# Chat Slot Slash Commands

| | |
|---|---|
| **Created** | 2026-04-23 |
| **Updated** | 2026-05-06 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |

## What is the Problem Being Solved?

In Endo's Chat UI, a form "slot" is a field on a request (form, endow
modal, send-form) that expects a capability reference, typically a
live object such as a counter, a reader, or a worker.
Today, the only way to fill such a slot is to type (or drop in) a pet
name path that already resolves to a value in the agent's namespace.
If the user wants to pass a throwaway value (for example, a tiny
`x => x + 1` function, a literal configuration record, or a freshly
evaluated bundle) they must:

1. Open the command bar, type `/js x => x + 1`, and run it.
2. When the eval completes, open the resulting value modal and
   assign it a pet name (e.g., `tmp-inc`).
3. Switch back to the pending request, type `tmp-inc` into the slot,
   and submit.
4. Later, remember to remove `tmp-inc` from the pet store so it does
   not clutter the namespace or pin its subgraph indefinitely.

This three-step round-trip is tedious for one-off values and
pollutes the pet store with single-use names.
The `lal-fae-form-provisioning` experience, in particular, surfaces
forms with many slots where most fillers are literal JSON or small
anonymous functions that the user has no reason to name.

**Slot-local slash commands** collapse steps 1 through 4 into one:
the slot input itself recognises the `/` prefix, dispatches to a
slash command (e.g., `/js`), evaluates the expression, and fills the
slot with the resulting capability without ever assigning a pet
name or entering the pet store.
If the enclosing request is submitted, the request retains the value
through its own formula inputs.
If the request is cancelled or discarded, the value is
garbage-collected.

This design depends on three observations:

- Pet names cannot start with `/` (pet-name regex forbids `/`), so
  `/verb …` is unambiguous against any legal pet name path.
- The daemon already supports anonymous eval formulas via
  `pinTransient`/`unpinTransient` in `formulateEval`.
  The host's own `/js` without a `resultName` uses this path:
  the value is pinned inside the formula-graph lock, the caller
  holds it across the `await value`, then unpins in a `finally`.
- A slot submission re-expresses pet names as formula inputs on the
  downstream formula (e.g., the host's `endow` reduces `bindings`
  to `endowmentFormulaIdsOrPaths`, then calls `formulateEval`, which
  records those inputs as graph edges).
  If the slot value is a formula identifier that the daemon is
  currently retaining on the caller's behalf, the downstream
  formula's inputs will retain it the moment the outer formula is
  persisted to disk.

Taken together, a slot filler that does not pollute the pet store
needs exactly one extra piece of machinery: a **temporary pin that
survives from the moment the slash command produces a value until
the outer request either absorbs it or aborts**.
The Chat UI holds that pin via a release capability; the daemon
enforces its lifetime, including automatic release if the captp
connection severs.

## Design

### Syntax inside a slot input

A slot input enters **slash mode** the instant its buffer starts with
a `/` character and nothing else has been committed yet.
In slash mode, the input behaves like a miniature command bar:

- The first whitespace-delimited token after `/` is the verb
  (`js`, `json`, `locator`, …).
- The remainder, if any, is the verb's argument text.
- The input's modeline switches from "pet name" hints to
  "slash command: &lt;verb&gt;" hints.

Because pet names cannot contain `/`, the prefix is a reliable
discriminator.
If the user types `//` or `/ ` the input rejects the second
character with a modeline error.
These sequences are reserved for future escapes.

Initial verb set:

| Verb       | Argument            | Produces                                                |
|------------|---------------------|---------------------------------------------------------|
| `/js`      | single-line expr    | Evaluated expression in the default worker (`@main`).   Cmd-Enter (or Ctrl-Enter) expands the input to a Monaco popover for multi-line editing, mirroring the main command line. |
| `/json`    | JSON literal        | Marshalled Passable from `JSON.parse(arg)`.             |
| `/locator` | Endo locator URL    | Result of `E(powers).provideLocator(url)`.              |
| `/ref`     | pet name path       | Explicit pet name path (pass-through; useful for clarity). |

Verb registration is extensible; the initial set is chosen to cover
the majority of observed "I just want to inline a small value" cases.
`/eval` is accepted as an alias for `/js`, mirroring the command bar.

There is intentionally no separate `/js-block` verb.
The Cmd-Enter (Ctrl-Enter on non-Mac) expansion of `/js` to Monaco
is the same affordance the main command line offers, so the slot's
slash mode and the command bar share one mental model for
multi-line eval.

### Dispatch and the slot state machine

The slot component's state machine grows two states beyond its
existing "pet name autocomplete" and "committed chip":

```
   empty ──'/'──▶ slashCompose ──Enter──▶ evaluating
     ▲                                       │
     │                                       ├── success ──▶ chipRetained
     │                                       └── failure ──▶ slashComposeWithError
     │
     └── any other char ──▶ petNameCompose (existing)
```

- **`slashCompose`**: the input renders the verb as a non-editable
  chip at its left edge, followed by a free-text editor for the
  argument.
  Backspacing through the argument back to the chip removes the
  chip and returns to `empty`.
  `Esc` also returns to `empty`.
  Cmd-Enter (Ctrl-Enter) on a `/js` argument expands the editor to
  a Monaco popover.
- **`evaluating`**: the component calls the per-verb handler,
  which returns `Promise<{ id: FormulaIdentifier, release: ERef<Releaser> }>`.
  During evaluation the chip shows an indeterminate spinner.
  The outer form's submit button is disabled while any slot is
  `evaluating`.
- **`chipRetained`**: the filled slot renders as a dashed-border
  chip labelled with the verb and a truncated argument preview
  (e.g., `/js x => x+1`).
  The chip carries the formula identifier internally; the daemon
  retains the underlying value via the release capability.
  The chip exposes a "show value" affordance: clicking it opens
  the same value-inspection modal the user would see if the
  identifier had been resolved through the pet store.
  `Backspace` clears the chip (which triggers the release
  callback); the outer form treats the slot as unfilled.

If the handler rejects, the spinner is replaced by an error glyph
and the argument text is restored to the input for editing.
The modeline shows the error message (truncated, with hover to
expand).

### Per-verb handlers and the retained-value protocol

Each verb handler follows this shape:

```js
/** @returns {Promise<{ id: FormulaIdentifier, release: ERef<Releaser> }>} */
const handleJs = async (argument) => {
  const { id, release } = await E(powers).makeRetainedValue({
    type: 'eval',
    source: argument,
    codeNames: [],
    endowments: [],
    workerName: '@main',
  });
  return harden({ id, release });
};
```

`makeRetainedValue` is a new method on `EndoHost` and `EndoGuest`
that wraps the existing transient-pin code path but exposes the
pin/unpin lifecycle to the caller explicitly.
See *Daemon changes* below.

The Chat UI holds the `release` capability on the slot model.
It calls `E(release).release()` when:

- The slot is cleared (user backspaces the chip, edits the field,
  or types a new slash command over the top of an existing one).
- The outer form is cancelled (`Esc`, close button, navigation
  away).
- The outer form is submitted **successfully**.
  The downstream formula now has its own retention edge to `id`,
  so the Chat UI no longer needs to hold the pin.

If the submission fails, the slot remains filled with the chip and
the pin is retained, so the user can correct other fields and
resubmit without re-evaluating.

### Submission: how the slot value reaches the formula

Slot-bearing forms in Chat today either:

- Collect `Record<string, PetNamePath>` and hand it to
  `E(powers).endow(messageNumber, bindings, workerName, resultName)`
  (see `inbox-component.js` definition rendering and `host.js`
  `endow`); or
- Collect `Record<string, unknown>` of form values and hand it to
  `E(powers).submit(messageNumber, values)` (see `mail.js` `submit`).

Both daemon entry points already accept either a pet name (or pet
name path), or in the case of `submit` an arbitrary Passable, which
includes capability references.
We extend them to accept a **formula identifier** in any slot
position as well:

- `endow` already resolves bindings by calling
  `petStore.identifyLocal` when the binding is a bare pet name or
  by returning the name path otherwise, producing a
  `(FormulaIdentifier | NamePath)[]` passed into `formulateEval`.
  We add a third branch: if the binding is a string that matches
  the `formula:` scheme (or an object carrying a tagged
  `FormulaIdentifier`), pass it through directly.
- `submit` marshals its `values` record through
  `formulateMarshalValue` already, which emits a formula whose
  inputs retain every capability reference mentioned in the
  record.
  The Chat UI packages a retained formula ID as a
  `Remotable` or as a tagged reference object that
  `formulateMarshalValue` can capture as an input edge.

The submission payload thus crosses the daemon boundary carrying
formula IDs that the Chat UI is currently retaining via release
capabilities.
The daemon's formulation persists the new formula to disk
(per the daemon's "disk before graph" rule), at which point the
dependency graph records a retention edge from the new formula
to the previously-retained formula.
Only then does Chat call `E(release).release()` (see *Release
ordering* below).

### Daemon changes

**`makeRetainedValue(spec) -> { id, release }`** on
`EndoHost` and `EndoGuest`.

`spec` is a tagged union.
Initial variants:

```ts
type RetainedValueSpec =
  | { type: 'eval';
      source: string;
      codeNames: string[];
      endowments: (PetNamePath | FormulaIdentifier)[];
      workerName?: Name;
    }
  | { type: 'marshal'; value: Passable }
  | { type: 'locator'; locator: string };
```

For `type: 'eval'`, the implementation is exactly the existing
transient-pin path in `host.js` and `guest.js`: call `formulateEval`
with `pinTransient` supplied, **but do not** `await value` and do
**not** `unpinTransient` in a `finally` before returning.
Instead, return `{ id, release }` where `release` wraps
`unpinTransient(id)` and drains any resulting collection.

For `type: 'marshal'`, delegate to `formulateMarshalValue` with
`pinTransient`.
For `type: 'locator'`, delegate to `provideLocator` (or whatever
locator formula type exists under `daemon-locator-terminology`)
with a transient pin.

The `release` capability is an exo with a single `release()`
method, returned as a capability (not a thunk) so it survives
serialization.
It is itself transient: its own formula inputs retain the
target, but it only lives until `release()` is called or until
the captp connection that holds the reference severs.

#### Release Exo lifetime and captp partition

The release Exo is held by the Chat UI across the captp connection
to the daemon.
If that connection severs (network failure, daemon restart, Chat
process termination), the Exo on the daemon side is partitioned:
its export is dropped from the captp's export table and any
outstanding eventual sends to it reject with a bounded reason
(typically a "remote disconnected" error).
The holder, while the connection was live, can obtain a
**cancellation promise** for the Exo via the standard CapTP
partition-handler mechanism (see `@endo/captp`'s connection-level
abort signal).
That promise resolves (or rejects) when the captp slot for the Exo
is partitioned, allowing the holder to react to the loss without
polling.

The daemon side wires the partition signal to the Exo's intrinsic
behavior: when the captp connection severs, the daemon invokes
`release()` on the Exo's behalf, draining the transient pin.
The retained value's lifetime is therefore bounded by the captp
connection: at worst, the value remains pinned until the connection
closes, at which point it is released and (if no other formula
retains it) collected.

If the underlying captp partition-handler API is not yet exposed
in the form this design needs (per-Exo cancellation promise,
disconnection-triggered intrinsic release), the implementation
should add the minimum surface required and note the addition in
the Daemon changes phase.
Pinning the value's lifetime to the captp connection is what makes
this design's leak surface bounded; if the daemon cannot detect the
disconnect, the design degrades to "leak until daemon restart",
which is unacceptable.

```
┌─────────────────────────────────────────────────────────────┐
│ Chat                                                         │
│   retainedSlot := { id, release }                            │
│   on submit success → await E(release).release()             │
│   on submit failure → keep                                   │
│   on cancel         → await E(release).release()             │
│   on captp severance → daemon releases automatically         │
└─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│ Daemon                                                       │
│   formulateEval(…, pinTransient)                             │
│     • persists eval formula to disk                          │
│     • pinTransient(id) inside formula-graph lock             │
│   returns { id, value: Promise<…> }                          │
│                                                              │
│   release exo                                                │
│     • release() → unpinTransient(id) + maybeCollect          │
│     • partition signal → release() invoked automatically     │
└─────────────────────────────────────────────────────────────┘
```

**Persistence.**
The transient pin is in-memory only (see `graph.js`
`transientRoots`).
If the daemon restarts while a Chat UI holds a retained
reference, the formula is still on disk but no longer pinned.
If nothing else retains it, the GC sweeps it on restart.
This is acceptable because a restart invalidates any pending
request in Chat anyway: the user would need to resubmit the
outer operation, at which point they will re-enter the slash
command.
The alternative (persisting transient pins) would leak values
indefinitely if the Chat UI crashed before releasing.

**Release ordering.**
Chat must not call `release()` before the daemon has committed
the outer formula.
The submit methods (`endow`, `submit`, …) return a promise that
resolves when the outer formula is fully persisted and its graph
edges are in place.
Chat awaits that promise before calling `release()`.
This matches the daemon's "disk before graph" invariant: once
`formulateEval` or `formulateMarshalValue` has returned, the
new retention edge is live, so unpinning the previously-retained
root will not collect the value.

**No new formula type.**
The retained value is an ordinary formula (`eval`, `marshal`,
`locator`) with a real locator.
The "retained" characteristic is purely lifecycle: the
transient-root pin tied to the captp connection.
It is not a persisted property.
This avoids a cross-cutting schema change and keeps the existing
formulation code paths authoritative.
Crucially, because the slot value has a real locator at all times
(never an opaque "ephemeral identifier" that lacks an addressable
formula on disk), every existing daemon affordance that takes a
formula identifier (resolve, inspect, dependency-walk) works on
the retained value without special cases.

### Chat UI changes

**Slot input component (`slot-input.js`, new).**
Today, slot-like inputs are bespoke in each site that needs them:

- `endow-modal.js` builds slot inputs inline and attaches
  `petNamePathAutocomplete` to each.
- `inbox-component.js` does the same for definition messages.
- `send-form.js`, `form-builder.js`, and `counter-proposal-form.js`
  have their own variants.

We extract a single `createSlotInput({ $container, E, powers,
type, onChange })` component whose internal state machine
implements the states above and whose external API is:

```ts
type SlotInputAPI = {
  getValue():
    | { kind: 'petName'; path: NamePath }
    | { kind: 'retained'; id: FormulaIdentifier; release: ERef<Releaser> }
    | undefined;
  clear(): Promise<void>;  // calls release() if retained
  focus(): void;
  dispose(): Promise<void>;  // releases any outstanding retained value
};
```

Call sites migrate to the new component.
The `type` parameter matches the form-request field type taxonomy
(`petNamePath`, `source`, etc.) and gates which verbs the slot
offers.
A `source`-typed slot offers `/js` by default and does not need
slash mode to be triggered: it is slash mode from the start.

**Slot picker drop-down.**
For mouse-and-touch users, each slot exposes a picker affordance
(a small dropdown caret at the trailing edge of the input).
Opening the picker reveals the **petname drop-down**: a scrollable
list of pet names of the slot's accepted type, drawn from the
agent's namespace.
The slot's modeline simultaneously notes that typing `/` will
start a command, which opens the **next drop-down for commands**.
Two-stage drop-down progression: the petname drop-down is the
primary surface, and the command drop-down is one step away via
the modeline-advertised `/` shortcut.
Keyboard users see the same modeline hint and can type `/` to
move directly into slash mode without going through the picker.

**Show value.**
The retained chip's "show value" affordance dereferences the
formula identifier through `E(powers).provide(id)` (the daemon's
ordinary resolver) and renders the result in the same value-modal
the rest of Chat uses for pet-store entries.
Because the slot holds a real locator at all times, no special
"ephemeral inspector" is needed: the existing inspector works
against the retained formula identifier.

**Error rendering.**
When the verb handler rejects, the slot chip enters an error
substate: red border, argument text re-editable, error message
in the inline hint row beneath the slot.
`Enter` re-runs the handler with the current argument; `Esc`
clears the slot.

**Form record capture.**
The outer form's submit handler walks each slot's `getValue()`:

- `petName` → pass path through as today.
- `retained` → pass `id` through; remember `release` for
  post-submit cleanup.
- `undefined` → fail validation.

After a successful submit, the form calls
`Promise.all(releases.map(r => E(r).release()))`.
On failure, releases are retained on the form model so the user
can resubmit without re-evaluation.
On form destruction (modal close, navigation), all outstanding
releases are fired regardless of submit outcome: the form's
`dispose` is the authoritative cleanup point.

**Modeline hints.**
Per `chat-command-bar.md`, add slot-local modeline entries:

| State             | Hint                                                    |
|-------------------|---------------------------------------------------------|
| `empty` (slot)    | `/ slash command · type pet name · ▾ pick from petnames` |
| `slashCompose`    | `Enter evaluate · ⌘⏎ Monaco · Esc cancel · ⌫ remove verb` |
| `evaluating`      | `running…`                                               |
| `chipRetained`    | `⌫ clear slot · 👁 show value · Enter submit form`        |

### Interaction with pending commands and command bar

`chat-pending-commands.md` describes the pending region for
top-level commands.
Slot-local slash commands do **not** appear in that region
because they are not top-level commands: they are parts of a
larger form-in-progress.
Their in-flight state is owned by the form they fill.
If the top-level form itself is recorded as a pending command
(per `daemon-commands-as-messages.md`), the retained slot
values are captured as its inputs, and the pending entry
naturally reflects the composite operation.

## Security considerations

- **Retained pins cannot escalate authority.**
  `makeRetainedValue` runs inside the caller's agent (host or
  guest) and pins a formula that the caller is already authorised
  to produce via its existing `evaluate`/`storeValue`/`provideLocator`
  verbs.
  The only added capability is the right to *delay* its
  collection until a `release` capability is invoked or until
  the captp connection severs.
  Object-capability confinement on the formula itself is
  unchanged: the eval body sees only the endowments it was given.

- **No daemon-internal reference leakage.**
  `release` is an exo whose only method is `release()`.
  It carries no reference to the target value, the target's
  worker, or the daemon's internal graph; it is a deactivation
  handle with zero other authority.
  A guest that receives a `release` from its host cannot read or
  invoke the retained value through it.

- **Bounded lifetime on Chat crash.**
  If the Chat UI process dies between slash-command evaluation
  and form submission, the WebSocket to the daemon closes and the
  captp partition handler fires.
  Each release Exo held over that connection is partitioned and
  its intrinsic disconnect handler invokes `release()` on the
  daemon side, dropping the transient pin.
  This bounds leakage strictly to the duration of a live Chat
  captp session.

- **Cross-peer eval exposure.**
  Slot slash commands are evaluated in the agent that owns the
  Chat profile.
  If the enclosing form is being sent to a remote peer (for
  example, a guest filling a slot on a form from a remote host),
  the retained formula is created in the guest's namespace.
  The remote peer receives a *reference* to the resulting
  capability, not the source.
  This is the same confinement posture as naming a value in the
  pet store and passing it by reference.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [daemon-form-request](daemon-form-request.md) | Forms with slots are the primary consumer; this design extends how slot values are supplied. |
| [chat-command-bar](chat-command-bar.md) | Slash syntax and modeline conventions reused inside slots, including the Cmd-Enter Monaco expansion. |
| [daemon-guest-eval-simplification](daemon-guest-eval-simplification.md) | `/js` inside a guest's slot relies on direct `formulateEval` without proposal review. |
| [chat-pending-commands](chat-pending-commands.md) | Slot slash commands are *not* pending commands themselves; this design clarifies the boundary. |
| [daemon-commands-as-messages](daemon-commands-as-messages.md) | If commands become messages, the outer form's message can absorb retained inputs as its formula inputs. |
| [daemon-cross-peer-gc](daemon-cross-peer-gc.md) | Retained pins interact with the cross-peer GC protocol only through ordinary retention edges; no new cross-peer concerns. |

## Phased implementation

1. **Daemon: `makeRetainedValue` for `type: 'eval'`.**
   Introduce the method on host and guest, reusing the existing
   transient-pin-and-await path but exposing a `release` exo.
   Wire the captp partition signal to the Exo's intrinsic
   release.
   Unit tests: pin retention across an await; release triggers
   collection; retention through a second formula prevents
   collection after release; captp disconnect triggers release.
   *Size: S-M (2 to 3 days), captp partition wiring being the
   open variable.*

2. **Chat: extract `createSlotInput`.**
   Consolidate the current slot-input clones in `endow-modal.js`
   and `inbox-component.js` into one component.
   No behavioural change yet, just refactor with the existing
   pet-name-only semantics.
   *Size: S (1 day).*

3. **Chat: slash mode, `/js` verb, picker drop-down, show-value.**
   Add the state machine, the slash chip, the `/js` handler that
   calls `makeRetainedValue({ type: 'eval', … })`, the petname
   picker drop-down with modeline `/` hint, and the chip's
   show-value affordance.
   Wire the release lifecycle to the form's submit/cancel/dispose.
   Add Cmd-Enter Monaco expansion mirroring the command bar.
   *Size: M (3 to 4 days).*

4. **Daemon + Chat: submission acceptance of formula IDs.**
   Extend `endow` bindings and `submit` values to accept formula
   IDs alongside pet names.
   Make Chat serialise retained slot values as formula IDs in
   the outbound payload.
   *Size: S-M (1 to 2 days).*

5. **Additional verbs.**
   Add `/json`, `/locator`, and `/ref`.
   *Size: S (1 to 2 days).*

Total: **M, roughly 1 week** for one developer.

## Design Decisions

1. **Slot as the unit of transient retention, not the command.**
   Transience belongs to the *use* of a value, not to the
   verb that produced it.
   `/js` in the command bar with `resultName` is persistent; the
   same `/js` inside a slot is transient because the slot's
   consumer decides its fate.
   This keeps the verb semantics uniform across contexts.

2. **Transient pin over "deferred formulation".**
   An alternative is to defer formulation entirely: the slot
   records the source text and arguments, and formulation
   happens only when the outer form submits.
   We rejected this because errors must surface immediately at
   the slot (syntax errors, resolver failures, worker-start
   failures) rather than appearing as opaque submit failures on
   the outer form.
   Formulate-now-pin-briefly preserves the existing eval error
   paths.

3. **Slash prefix is always the trigger.**
   A per-field toggle is less fluent for keyboard users.
   The slash prefix matches Chat's existing vocabulary and is
   unambiguous relative to pet names.
   A picker drop-down is still provided for mouse users, opening
   the petname drop-down first and advertising `/` as the route
   to commands.

4. **Verbs are registered, not hard-coded in the slot.**
   Slot verbs share a registry with command-bar commands but
   are filtered by slot `type`.
   This lets a `source`-typed slot expose only `/js`,
   while a generic capability slot exposes the full set.

5. **Release by capability, not by channel state.**
   Returning a `release` exo makes the lifetime explicit and
   testable.
   A purely implicit scheme (e.g., "release when the gateway
   session sends the next submit") would entangle UI and
   daemon-session state in a way that is hard to reason about
   across reconnects.
   The captp connection still serves as the outermost lifetime
   bound (via partition-triggered release), but inside that
   bound the release Exo is the explicit handle.

6. **Real locator over opaque ephemeral identifier.**
   Every slot value either has a real locator (a formula
   identifier the daemon recognises) or is a passable that the
   daemon can marshal.
   We deliberately do not introduce an "ephemeral identifier"
   distinct from an ordinary formula identifier.
   The retention is a property of the daemon's transient pin
   set, not of a different identifier kind.
   This means every existing affordance (show value, inspect,
   resolve, dependency-walk) works on the retained value
   without special cases.

7. **No new message type.**
   Slot slash commands never produce daemon messages.
   The outer form still produces the single `submit`, `endow`,
   or `form` message it already produces today, now with
   formula IDs in its payload.
   This keeps the message protocol unchanged.

## Known Gaps and Future Considerations

- [ ] Define the exact wire representation of a formula ID in
      `endow` bindings and `submit` values (tagged string vs.
      marshalled remotable).
      The simplest option is to leverage the existing marshalled
      Passable pipeline: the Chat UI resolves the retained ID
      to its capability through `provide(id)` and hands *that*
      capability to `submit`.
      Evaluate whether the additional round-trip is worth the
      uniformity.
- [ ] Confirm the captp partition-handler API surface needed to
      trigger Exo intrinsic release on disconnect.
      If the per-Exo cancellation promise is not yet exposed by
      `@endo/captp`, the implementation phase adds the minimum
      surface required; see *Release Exo lifetime and captp
      partition* above.
- [ ] **Future consideration (out of scope for this design):**
      a `/view`-like read-only inspector inside a slot.
      The chip's "show value" button covers the immediate
      need by reusing the existing value modal; a slot-local
      `/view` verb is a worthwhile follow-up but is not part
      of this slice.
- [ ] **Future consideration (out of scope):** per-gateway pin
      quota.
      No quota is needed at this time; the captp-bounded
      lifetime is the load-bearing safeguard.
      If future telemetry shows pathological pin counts during
      a single session, a quota can be added then.
- [ ] **Future consideration:** telemetry to record slot-slash
      usage patterns and inform the verb set.

## Affected Packages

- `packages/daemon/src/host.js`, `guest.js`: add
  `makeRetainedValue`; extract the shared transient-eval helper.
- `packages/daemon/src/daemon.js`: export the helper and the
  `release` exo constructor from `DaemonCore`.
- `packages/daemon/src/mail.js`: `endow`, `submit`, and form
  handling accept formula IDs in binding positions.
- `packages/daemon/src/interfaces.js`: interface guards for
  `makeRetainedValue`.
- `packages/daemon/src/help-text.js`, `help.md`: document the
  new verb.
- `packages/daemon/src/graph.js`: expose a captp-scoped pin
  tracker (minor extension of the existing `pinTransient`
  counter) and wire the partition-handler intrinsic release.
- `packages/daemon/src/daemon.js` (gateway bind): track
  transient pins per captp connection and release on
  disconnect.
- `packages/chat/slot-input.js` (new): unified slot input
  component with slash mode, picker drop-down, and show-value
  affordance.
- `packages/chat/endow-modal.js`, `inbox-component.js`,
  `send-form.js`, `form-builder.js`,
  `counter-proposal-form.js`: migrate to `slot-input.js`.
- `packages/chat/command-registry.js`: new `slotVerbs` table
  keyed by slot type.
- `packages/chat/index.css`: styles for the slash chip,
  retained chip, picker drop-down, and error substate.

## Prompt

> Design a way to support slash commands (e.g. `/js`) inside slot
> inputs in the Chat UI, so that users can endow a capability
> from whole cloth at the point of use, without having to first
> name it in the pet store.
> The key insight is a temporary pin that holds the value alive
> until the enclosing operation retains it; if the enclosing
> operation is cancelled, the pin expires and the value is
> garbage-collected.
