# Chat Slot Slash Commands

| | |
|---|---|
| **Created** | 2026-04-23 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

In Endo's Chat UI, a form "slot" is a field on a request (form, endow
modal, send-form) that expects a capability reference — typically a
live object such as a counter, a reader, or a worker.
Today, the only way to fill such a slot is to type (or drop in) a pet
name path that already resolves to a value in the agent's namespace.
If the user wants to pass a throwaway value — for example, a tiny
`x => x + 1` function, a literal configuration record, or a freshly
evaluated bundle — they must:

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

**Slot-local slash commands** collapse steps 1–4 into one:
the slot input itself recognises the `/` prefix, dispatches to a
slash command (e.g., `/js`), evaluates the expression, and fills the
slot with the resulting capability — without ever assigning a pet
name or entering the pet store.
If the enclosing request is submitted, the request retains the value
through its own formula inputs.
If the request is cancelled or discarded, the ephemeral value is
garbage-collected.

This design depends on three observations:

- Pet names cannot start with `/` (pet-name regex forbids `/`), so
  `/verb …` is unambiguous against any legal pet name path.
- The daemon already supports anonymous, ephemeral eval formulas via
  `pinTransient`/`unpinTransient` in `formulateEval` — the host's own
  `/js` without a `resultName` uses this path.
  The value is pinned inside the formula-graph lock, the caller
  holds it across the `await value`, then unpins in a `finally`.
- A slot submission re-expresses pet names as formula inputs on the
  downstream formula (e.g., the host's `endow` reduces `bindings`
  to `endowmentFormulaIdsOrPaths`, then calls `formulateEval`, which
  records those inputs as graph edges).
  If the slot value is an ephemeral formula ID, the downstream
  formula's inputs will retain it the moment the outer formula is
  persisted to disk.

Taken together, an ephemeral slot filler needs exactly one extra
piece of machinery: a **temporary pin that survives from the moment
the slash command produces a value until the outer request either
absorbs it or aborts**.
The Chat UI holds that pin; the daemon enforces its lifetime.

## Design

### Syntax inside a slot input

A slot input enters **slash mode** the instant its buffer starts with
a `/` character and nothing else has been committed yet.
In slash mode, the input behaves like a miniature command bar:

- The first whitespace-delimited token after `/` is the verb
  (`js`, `js-block`, `json`, `locator`, …).
- The remainder, if any, is the verb's argument text.
- The input's modeline switches from "pet name" hints to
  "slash command: &lt;verb&gt;" hints.

Because pet names cannot contain `/`, the prefix is a reliable
discriminator.
If the user types `//` or `/ ` the input rejects the second
character with a modeline error — these are reserved for future
escapes.

Initial verb set:

| Verb       | Argument            | Produces                                                |
|------------|---------------------|---------------------------------------------------------|
| `/js`      | single-line expr    | Evaluated expression in the default worker (`@main`)    |
| `/js-block`| multi-line block    | Evaluated block (opens an inline Monaco popover)        |
| `/json`    | JSON literal        | Marshalled Passable from `JSON.parse(arg)`              |
| `/locator` | Endo locator URL    | Result of `E(powers).provideLocator(url)`               |
| `/ref`     | pet name path       | Explicit pet name path (pass-through; useful for clarity) |

Verb registration is extensible; the initial set is chosen to cover
the majority of observed "I just want to inline a small value" cases.
`/eval` is accepted as an alias for `/js`, mirroring the command bar.

### Dispatch and the slot state machine

The slot component's state machine grows two states beyond its
existing "pet name autocomplete" and "committed chip":

```
   empty ──'/'──▶ slashCompose ──Enter──▶ evaluating
     ▲                                       │
     │                                       ├── success ──▶ chipEphemeral
     │                                       └── failure ──▶ slashComposeWithError
     │
     └── any other char ──▶ petNameCompose (existing)
```

- **`slashCompose`** — the input renders the verb as a non-editable
  chip at its left edge, followed by a free-text editor for the
  argument.
  Backspacing through the argument back to the chip removes the
  chip and returns to `empty`.
  `Esc` also returns to `empty`.
- **`evaluating`** — the component calls the per-verb handler,
  which returns `Promise<{ id: FormulaIdentifier, release: () =&gt; Promise&lt;void&gt; }>`.
  During evaluation the chip shows an indeterminate spinner.
  The outer form's submit button is disabled while any slot is
  `evaluating`.
- **`chipEphemeral`** — the filled slot renders as a dashed-border
  chip labelled with the verb and a truncated argument preview
  (e.g., `/js x => x+1`).
  It carries the ephemeral formula ID internally but no pet name.
  `Backspace` clears it (which triggers the release callback);
  the outer form treats the slot as unfilled.

If the handler rejects, the spinner is replaced by an error glyph
and the argument text is restored to the input for editing.
The modeline shows the error message (truncated, with hover to
expand).

### Per-verb handlers and the ephemeral-value protocol

Each verb handler follows this shape:

```js
/** @returns {Promise<{ id: FormulaIdentifier, release: () => Promise<void> }>} */
const handleJs = async (argument) => {
  const { id, release } = await E(powers).makeEphemeralValue({
    type: 'eval',
    source: argument,
    codeNames: [],
    endowments: [],
    workerName: '@main',
  });
  return harden({ id, release });
};
```

`makeEphemeralValue` is a new method on `EndoHost` and `EndoGuest`
that wraps the existing ephemeral-eval code path but exposes the
pin/unpin lifecycle to the caller explicitly.
See *Daemon changes* below.

The Chat UI holds the `release` thunk on the slot model.
It calls `release()` when:

- The slot is cleared (user backspaces the chip, edits the field,
  or types a new slash command over the top of an existing one).
- The outer form is cancelled (`Esc`, close button, navigation
  away).
- The outer form is submitted **successfully** — the downstream
  formula now has its own retention edge to `id`, so the Chat UI
  no longer needs to hold the pin.

If the submission fails, the slot remains filled with the
ephemeral chip and the pin is retained, so the user can correct
other fields and resubmit without re-evaluating.

### Submission: how the slot value reaches the formula

Slot-bearing forms in Chat today either:

- Collect `Record<string, PetNamePath>` and hand it to
  `E(powers).endow(messageNumber, bindings, workerName, resultName)`
  — see `inbox-component.js` definition rendering and `host.js`
  `endow`; or
- Collect `Record<string, unknown>` of form values and hand it to
  `E(powers).submit(messageNumber, values)` — see `mail.js` `submit`.

Both daemon entry points already accept either a pet name / pet
name path *or* (in the case of `submit`) an arbitrary Passable,
which includes capability references.
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
  The Chat UI packages an ephemeral formula ID as a
  `Remotable` or as a tagged reference object that
  `formulateMarshalValue` can capture as an input edge.

The submission payload thus crosses the daemon boundary carrying
formula IDs that the Chat UI has pinned.
The daemon's formulation persists the new formula to disk
(per the daemon's "disk before graph" rule), at which point the
dependency graph records a retention edge from the new formula
to the ephemeral formula.
Only then does Chat call `release()` — see *Release ordering*
below.

### Daemon changes

**`makeEphemeralValue(spec) -> { id, release }`** on
`EndoHost` and `EndoGuest`.

`spec` is a tagged union.
Initial variants:

```ts
type EphemeralValueSpec =
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
ephemeral path in `host.js` and `guest.js` — call `formulateEval`
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
It is itself ephemeral — its own formula inputs retain the
target — but it only lives until `release()` is called or until
the caller drops its reference.

```
┌─────────────────────────────────────────────────────────────┐
│ Chat                                                         │
│   ephemeralSlot := { id, release }                           │
│   on submit success → await E(release).release()             │
│   on submit failure → keep                                   │
│   on cancel         → await E(release).release()             │
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
└─────────────────────────────────────────────────────────────┘
```

**Persistence.**
The transient pin is in-memory only (see `graph.js`
`transientRoots`).
If the daemon restarts while a Chat UI holds an ephemeral
reference, the formula is still on disk but no longer pinned.
If nothing else retains it, the GC sweeps it on restart.
This is acceptable because a restart invalidates any pending
request in Chat anyway — the user would need to resubmit the
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
new retention edge is live, so unpinning the ephemeral root
will not collect the value.

**No new formula type.**
The ephemeral value is an ordinary formula (`eval`, `marshal`,
`locator`).
The "ephemeral" characteristic is purely lifecycle — the
transient-root pin — not a persisted property.
This avoids a cross-cutting schema change and keeps the existing
formulation code paths authoritative.

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
    | { kind: 'ephemeral'; id: FormulaIdentifier; release: ERef<Release> }
    | undefined;
  clear(): Promise<void>;  // calls release() if ephemeral
  focus(): void;
  dispose(): Promise<void>;  // releases any outstanding ephemeral
};
```

Call sites migrate to the new component.
The `type` parameter matches the form-request field type taxonomy
(`petNamePath`, `source`, etc.) and gates which verbs the slot
offers.
A `source`-typed slot offers `/js` by default and does not need
slash mode to be triggered — it is slash mode from the start.

**Error rendering.**
When the verb handler rejects, the slot chip enters an error
substate: red border, argument text re-editable, error message
in the inline hint row beneath the slot.
`Enter` re-runs the handler with the current argument; `Esc`
clears the slot.

**Form record capture.**
The outer form's submit handler walks each slot's `getValue()`:

- `petName` → pass path through as today.
- `ephemeral` → pass `id` through; remember `release` for
  post-submit cleanup.
- `undefined` → fail validation.

After a successful submit, the form calls
`Promise.all(releases.map(r => E(r).release()))`.
On failure, releases are retained on the form model so the user
can resubmit without re-evaluation.
On form destruction (modal close, navigation), all outstanding
releases are fired regardless of submit outcome — the form's
`dispose` is the authoritative cleanup point.

**Modeline hints.**
Per `chat-command-bar.md`, add slot-local modeline entries:

| State             | Hint                                                    |
|-------------------|---------------------------------------------------------|
| `empty` (slot)    | `/ slash command · type pet name`                        |
| `slashCompose`    | `Enter evaluate · Esc cancel · Backspace remove verb`    |
| `evaluating`      | `running…`                                               |
| `chipEphemeral`   | `⌫ clear slot · Enter submit form`                       |

### Interaction with pending commands and command bar

`chat-pending-commands.md` describes the pending region for
top-level commands.
Slot-local slash commands do **not** appear in that region
because they are not top-level commands — they are parts of a
larger form-in-progress.
Their in-flight state is owned by the form they fill.
If the top-level form itself is recorded as a pending command
(per `daemon-commands-as-messages.md`), the ephemeral slot
values are captured as its inputs, and the pending entry
naturally reflects the composite operation.

## Security considerations

- **Ephemeral pins cannot escalate authority.**
  `makeEphemeralValue` runs inside the caller's agent (host or
  guest) and pins a formula that the caller is already authorised
  to produce via its existing `evaluate`/`storeValue`/`provideLocator`
  verbs.
  The only added capability is the right to *delay* its
  collection until a `release` capability is invoked.
  Object-capability confinement on the formula itself is
  unchanged: the eval body sees only the endowments it was given.

- **No daemon-internal reference leakage.**
  `release` is an exo whose only method is `release()`.
  It carries no reference to the target value, the target's
  worker, or the daemon's internal graph; it is a deactivation
  handle with zero other authority.
  A guest that receives a `release` from its host cannot read or
  invoke the ephemeral value through it.

- **Bounded lifetime on Chat crash.**
  If the Chat UI process dies between slash-command evaluation
  and form submission, the WebSocket to the daemon closes and the
  daemon can, at its discretion, drop transient pins held by that
  gateway session.
  We add a **session-scoped pin set** to the gateway:
  `pinTransient` calls made through a given gateway connection
  are recorded in that connection's pin set, and the set is
  released on disconnect.
  This bounds leakage to the duration of a live Chat session.

- **Denial-of-service via pin flooding.**
  A malicious or buggy UI could create many ephemeral values and
  never release them.
  The daemon already has a broad ceiling on formula creation rate
  via worker quotas; the gateway session cap on outstanding
  transient pins (configurable, default e.g. 1,024) adds a second
  line of defence specific to this feature.

- **Cross-peer eval exposure.**
  Slot slash commands are evaluated in the agent that owns the
  Chat profile.
  If the enclosing form is being sent to a remote peer — e.g., a
  guest filling a slot on a form from a remote host — the
  ephemeral formula is created in the guest's namespace.
  The remote peer receives a *reference* to the resulting
  capability, not the source.
  This is the same confinement posture as naming an ephemeral
  value in the pet store and passing it by reference.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [daemon-form-request](daemon-form-request.md) | Forms with slots are the primary consumer; this design extends how slot values are supplied. |
| [chat-command-bar](chat-command-bar.md) | Slash syntax and modeline conventions reused inside slots. |
| [daemon-guest-eval-simplification](daemon-guest-eval-simplification.md) | `/js` inside a guest's slot relies on direct `formulateEval` without proposal review. |
| [chat-pending-commands](chat-pending-commands.md) | Slot slash commands are *not* pending commands themselves; this design clarifies the boundary. |
| [daemon-commands-as-messages](daemon-commands-as-messages.md) | If commands become messages, the outer form's message can absorb ephemeral inputs as its formula inputs. |
| [daemon-cross-peer-gc](daemon-cross-peer-gc.md) | Ephemeral pins interact with the cross-peer GC protocol only through ordinary retention edges — no new cross-peer concerns. |

## Phased implementation

1. **Daemon: `makeEphemeralValue` for `type: 'eval'`.**
   Introduce the method on host and guest, reusing the existing
   transient-pin-and-await path but exposing a `release` exo.
   Unit tests: pin retention across an await; release triggers
   collection; retention through a second formula prevents
   collection after release.
   *Size: S (1–2 days).*

2. **Chat: extract `createSlotInput`.**
   Consolidate the current slot-input clones in `endow-modal.js`
   and `inbox-component.js` into one component.
   No behavioural change yet — just refactor with the existing
   pet-name-only semantics.
   *Size: S (1 day).*

3. **Chat: slash mode and `/js` verb.**
   Add the state machine, the slash chip, and the `/js` handler
   that calls `makeEphemeralValue({ type: 'eval', … })`.
   Wire the release lifecycle to the form's submit/cancel/dispose.
   *Size: M (2–3 days).*

4. **Daemon + Chat: submission acceptance of formula IDs.**
   Extend `endow` bindings and `submit` values to accept formula
   IDs alongside pet names.
   Make Chat serialise ephemeral slot values as formula IDs in
   the outbound payload.
   *Size: S-M (1–2 days).*

5. **Additional verbs.**
   Add `/json`, `/locator`, `/ref`, and `/js-block` (Monaco
   popover).
   *Size: S (1–2 days).*

6. **Gateway session pin set.**
   Track per-connection transient pins and release on disconnect.
   This is the security-critical phase; land with tests for
   connection drop during an outstanding pin.
   *Size: S-M (2 days).*

Total: **M, roughly 1 week** for one developer.

## Design Decisions

1. **Slot as the unit of ephemerality, not the command.**
   Ephemerality belongs to the *use* of a value, not to the
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
   A per-field toggle or a picker button would be more
   discoverable but less fluent for keyboard users.
   The slash prefix matches Chat's existing vocabulary and is
   unambiguous relative to pet names.
   A picker button is still provided for mouse users, opening
   the same verb menu.

4. **Verbs are registered, not hard-coded in the slot.**
   Slot verbs share a registry with command-bar commands but
   are filtered by slot `type`.
   This lets a `source`-typed slot expose only `/js` and
   `/js-block`, while a generic capability slot exposes the
   full set.

5. **Release by capability, not by channel state.**
   Returning a `release` exo makes the lifetime explicit and
   testable.
   A purely implicit scheme (e.g., "release when the gateway
   session sends the next submit") would entangle UI and
   daemon-session state in a way that is hard to reason about
   across reconnects.

6. **No new message type.**
   Slot slash commands never produce daemon messages.
   The outer form still produces the single `submit`, `endow`,
   or `form` message it already produces today — now with
   formula IDs in its payload.
   This keeps the message protocol unchanged.

## Known Gaps and TODOs

- [ ] Define the exact wire representation of a formula ID in
      `endow` bindings and `submit` values (tagged string vs.
      marshalled remotable).
      The simplest option is to leverage the existing marshalled
      Passable pipeline — the Chat UI resolves the ephemeral ID
      to its capability through `provide(id)` and hands *that*
      capability to `submit`.
      Evaluate whether the additional round-trip is worth the
      uniformity.
- [ ] Decide whether `/js-block` gets an inline Monaco popover
      or opens the existing eval modal in a "return to slot"
      mode.
      The modal is simpler but disrupts the slot-filling flow.
- [ ] Define the slot-verb discovery UI (mouse picker,
      keyboard `Ctrl-/` menu).
- [ ] Interaction with `chat-view-edit-commands.md` — should a
      `/view`-like read-only inspector be available inside a
      slot to examine the value before the form submits?
- [ ] Per-gateway pin quota: choose a default and make it
      configurable.
- [ ] Telemetry: record slot-slash usage patterns to inform the
      verb set.

## Affected Packages

- `packages/daemon/src/host.js`, `guest.js` — add
  `makeEphemeralValue`; extract the shared ephemeral-eval helper.
- `packages/daemon/src/daemon.js` — export the helper and the
  `release` exo constructor from `DaemonCore`.
- `packages/daemon/src/mail.js` — `endow`, `submit`, and form
  handling accept formula IDs in binding positions.
- `packages/daemon/src/interfaces.js` — interface guards for
  `makeEphemeralValue`.
- `packages/daemon/src/help-text.js`, `help.md` — document the
  new verb.
- `packages/daemon/src/graph.js` — expose a gateway-scoped pin
  tracker (minor extension of the existing `pinTransient`
  counter).
- `packages/daemon/src/daemon.js` (gateway bind) — track
  transient pins per WebSocket connection and release on
  disconnect.
- `packages/chat/slot-input.js` (new) — unified slot input
  component with slash mode.
- `packages/chat/endow-modal.js`, `inbox-component.js`,
  `send-form.js`, `form-builder.js`,
  `counter-proposal-form.js` — migrate to `slot-input.js`.
- `packages/chat/command-registry.js` — new `slotVerbs` table
  keyed by slot type.
- `packages/chat/index.css` — styles for the slash chip,
  ephemeral chip, and error substate.

## Prompt

> Design a way to support slash commands (e.g. `/js`) inside slot
> inputs in the Chat UI — so that users can endow a capability
> from whole cloth at the point of use, without having to first
> name it in the pet store.
> The key insight is a temporary pin that holds the ephemeral
> value alive until the enclosing operation retains it; if the
> enclosing operation is cancelled, the pin expires and the value
> is garbage-collected.
