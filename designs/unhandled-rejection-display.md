# Unhandled-Rejection Display for CapTP Disconnect Reasons

| | |
|---|---|
| **Created** | 2026-05-10 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Source** | [endojs/endo-but-for-bots#171](https://github.com/endojs/endo-but-for-bots/issues/171), repro test PR [#174](https://github.com/endojs/endo-but-for-bots/pull/174) |

## What is the Problem Being Solved?

When a CapTP `CTP_DISCONNECT.reason` carries an `Error` instance, the
JSON-encoded form on the wire is the empty object `{}` because `Error`'s own
properties (`message`, `stack`, `name`) are non-enumerable and therefore
invisible to `JSON.stringify`.
The receiving side then rejects its outstanding promises with `{}` and the
unhandled-rejection display surfaces the literal `{}` for what was a
structured exception.

The symptom shows up in CI as `1 unhandled rejection` from the daemon test
suite (`packages/daemon/test/endo.test.js`) during racy teardown.
The AVA failure summary prints the rejected reason verbatim, so triage cannot
distinguish a `socket has been ended` race from an `assert.fail` in a guest
formula.
The repro test in PR [#174](https://github.com/endojs/endo-but-for-bots/pull/174)
pins both the wire round-trip and the receiver-side display: the wire format
loses the Error's message, and the inline `defaultOnReject` formatter prints
`CapTP <name> exception: {} ''` instead of the original message.

## Scope

This design covers only the diagnostic path for `CTP_DISCONNECT.reason` and
the unhandled-rejection traps that surface it.
It does not touch the substantive serialization of normal CapTP traffic
(`CTP_CALL`, `CTP_RETURN`, `CTP_RESOLVE`); those already pass through
`@endo/marshal`, which knows how to encode Errors.

The design does not propose moving `CTP_DISCONNECT.reason` onto the marshal
serializer, because the disconnect path must remain usable when the marshal
tables themselves are in an unknown state.
The fix is local to the disconnect encoding and the diagnostic trap.

## Design

### Two coordinated changes

The fix has two parts that must coordinate.
Either part on its own is insufficient: a sender that preserves Error
structure does no good if the receiver's display still falls through to a
formatter that drops it; a smarter receiver display has nothing to display if
the wire stripped the structure.

#### Sender side: encode Error reasons before stringify

In `packages/daemon/src/connection.js`, `messageToBytes` currently does:

```js
export const messageToBytes = message => {
  const text = JSON.stringify(message);
  const bytes = textEncoder.encode(text);
  return bytes;
};
```

When `message.type === 'CTP_DISCONNECT'` and `message.reason` is an `Error`,
extract the diagnostic-bearing fields explicitly before `JSON.stringify` so
that they survive the wire:

```js
export const messageToBytes = message => {
  let outgoing = message;
  if (message?.type === 'CTP_DISCONNECT' && message.reason instanceof Error) {
    const { name, message: errMessage, stack } = message.reason;
    outgoing = {
      ...message,
      reason: { '@@error': true, name, message: errMessage, stack },
    };
  }
  const text = JSON.stringify(outgoing);
  const bytes = textEncoder.encode(text);
  return bytes;
};
```

The `'@@error': true` sentinel marks the encoded shape so the receiver can
decide whether to reconstruct an `Error` instance or just render the fields.
The sentinel is preferable to duck-typing on `'message' in reason && 'stack'
in reason` because nothing prevents an application from sending a plain object
with those field names.

The narrow guard on `message.type === 'CTP_DISCONNECT'` keeps the change
out of the hot path for `CTP_CALL` and friends, which already serialize Error
fulfilments through `@endo/marshal`.

#### Receiver side: render Errors and Error-shaped reasons informatively

The `defaultOnReject` formatter in `connection.js` is currently:

```js
const defaultOnReject = err => {
  console.error(
    `CapTP ${name} exception:`,
    err?.message || err,
    err?.stack || '',
  );
};
```

This works for an actual `Error` instance and falls flat for a plain object.
Replace it with a formatter that:

1. Recognizes a real `Error` and prints `name: message` plus `stack`.
2. Recognizes the `'@@error': true` Error-shape sentinel and reconstructs an
   `Error` (or just prints `name: message\nstack`).
3. Falls through to `passableAsJustin` from `@endo/marshal` for any other
   reason value, because that handles remotables, promises, BigInts, and
   other Passables unambiguously where `JSON.stringify` would not.
4. As a final defence, treats reasons that are neither passable nor an Error
   shape with `String(reason)` plus the type tag, so a future unexpected
   reason type still produces something readable.

Sketch:

```js
import { passableAsJustin, isPassable } from '@endo/marshal';

const renderRejection = reason => {
  if (reason instanceof Error) {
    return `${reason.name}: ${reason.message}\n${reason.stack || ''}`;
  }
  if (
    reason &&
    typeof reason === 'object' &&
    /** @type {any} */ (reason)['@@error'] === true
  ) {
    const { name = 'Error', message = '', stack = '' } =
      /** @type {any} */ (reason);
    return `${name}: ${message}\n${stack}`;
  }
  if (isPassable(reason)) {
    return passableAsJustin(reason);
  }
  return `(non-passable ${typeof reason}) ${String(reason)}`;
};

const defaultOnReject = err => {
  console.error(`CapTP ${name} exception:`, renderRejection(err));
};
```

`passableAsJustin` is the project-standard rendering for diagnostic display
(per the Diagnostic Discipline rule in `CLAUDE.md`).
It is unambiguous for remotables and promises, where `JSON.stringify` would
strip them to `{}` or render them as `[object Object]`.

### Where the change goes

| File | Change |
|---|---|
| `packages/daemon/src/connection.js` | Update `messageToBytes` to encode Error reasons; replace inline `defaultOnReject` with the new `renderRejection` helper. |
| `packages/daemon/src/connection.js` (new export) | Export `renderRejection` so other diagnostic sites in the daemon can use the same formatter. |
| `packages/daemon/test/disconnect-error-display.test.js` | Already in place from PR [#174](https://github.com/endojs/endo-but-for-bots/pull/174); the implementation PR adds further coverage as needed. |

The `renderRejection` helper lives next to `messageToBytes` because the two
are conjugate sides of the same wire-shape decision.
A future refactor could move it to `@endo/captp` if other consumers grow a
need for it, but at present the daemon is the only site that wires up an
unhandled-rejection trap on a CapTP connection.

### Migration path for non-Passable reasons

Today, callers can pass anything to `abort(reason)`.
The repro test PR demonstrates that non-Passable values silently degrade to
`{}` on the wire.
After the fix:

- `Error` reasons are encoded and rendered explicitly.
- Passable reasons (strings, numbers, plain objects without remotables,
  marshalled exos) round-trip through `JSON.stringify` and render through
  `passableAsJustin`.
- Non-Passable reasons (a function, a remotable not in any marshal table,
  a Symbol that is not registered) fall through `messageToBytes` unchanged,
  so the wire receives whatever `JSON.stringify` produces (often `null` or
  `{}`).
  The receiver's `renderRejection` notes the mismatch with
  `(non-passable <typeof>) <String(reason)>` so the operator at least sees
  the type.

The migration does not require any caller change.
Existing call sites that pass `Error` reasons get a strictly better
diagnostic.
Existing call sites that pass non-Passable reasons get a slightly more
informative diagnostic and remain candidates for a follow-up cleanup pass.

## Alternatives Considered

### Alternative 1: route `CTP_DISCONNECT.reason` through `@endo/marshal`

Use `serialize`/`unserialize` from the existing CapTP marshal tables for the
`reason` field, the same way `CTP_RETURN.exception` already does.

Rejected: the disconnect path runs precisely when the connection state is
unreliable.
The marshal tables may have been GC'd, the c-list may be partially torn down,
or the disconnect may be happening because marshal itself failed.
Adding a serialize step in the disconnect path adds another failure mode to
the diagnostic.
The Error-shape extraction is intentionally syntactic (no marshal, no
exo machinery) so it cannot itself fail mid-disconnect.

### Alternative 2: change `JSON.stringify` to a replacer-aware variant

Pass a replacer function to `JSON.stringify` that detects `Error` and emits
`{name, message, stack}`.

Rejected as the sole change because the `replacer` runs at every key in the
tree, not just the top-level `reason`.
A nested Error in a passable graph would also be flattened to fields, which
would conflict with the marshal-side encoding for `CTP_RETURN.exception`.
The narrow `message.type === 'CTP_DISCONNECT'` guard in the proposed design
limits the rewrite to exactly the field that needs it.

### Alternative 3: receiver-side reformatter only

Leave the wire format alone; teach `defaultOnReject` to print "an
empty-object reason; the wire likely stripped an Error" when it sees `{}`.

Rejected: the message is gone.
No amount of receiver cleverness can recover the original `Error.message`
that `JSON.stringify` discarded on the sender.
A receiver-only fix produces a diagnostic that says "we lost something" but
not what was lost.
Operators have no way to tell a `socket has been ended` race from a
real assertion failure in a guest formula.

### Alternative 4: replace `JSON.stringify` with `@endo/marshal`'s `passableAsJustin` for the wire

Rejected: `passableAsJustin` produces a string in the Justin language.
That string would have to be parsed back on the receiver, which would itself
need a Justin parser.
The wire format would become incompatible with peers that have not adopted
the change.
The local extraction of Error fields is a strictly-additive change (the
unmodified field set is preserved, only the `reason` field shape changes
when it carries an Error).

## Test Plan

The failing tests in PR [#174](https://github.com/endojs/endo-but-for-bots/pull/174)
become the regression tests.
Both pass once the fix lands.

Additional tests the implementation PR should add:

1. A test that asserts a non-Error Passable reason
   (e.g. `'connection lost'` or `{ code: 42 }`) round-trips and renders
   through `passableAsJustin`.
2. A test that asserts a real `Error` instance with a custom `name`
   (e.g. `class CustomError extends Error`) preserves `name` on the wire.
3. A test that asserts a non-Passable reason (e.g. an unbound function)
   produces the `(non-passable <type>)` prefix on the receiver.
4. An integration test through the netstring framing
   (`tcp-netstring.js` path) that confirms the fix works for real
   connections and not just the in-process round-trip.

## Open Questions

1. **Should the encoded-Error sentinel be `'@@error'` or a different
   marker?**
   `'@@error'` follows the convention used elsewhere in the marshal world
   (`@qclass`, `@@iterator`).
   An alternative is to use the marshal `errorIdNum`-style encoding that
   CapTP already uses for `CTP_RETURN.exception`, but that requires the
   marshal tables and contradicts the rationale in Alternative 1.

2. **Should `renderRejection` be exported from `@endo/captp` instead?**
   Currently the trap lives in the daemon, but `@endo/captp` itself defines
   `onReject` as a callback option (`packages/captp/src/captp.js` line 267)
   with a default that does `console.error('CapTP', ourId, 'exception:',
   err)`.
   That default has the same `{}` rendering bug for any captp consumer that
   does not provide a custom `onReject`.
   The implementation PR should consider lifting the helper into `@endo/captp`
   so the bug is fixed at the source.

3. **Should the wire shape for an Error reason be a plain shape or a
   marshalled CapData blob?**
   Plain shape is simpler and survives `JSON.parse` directly.
   A CapData blob (using marshal serialize) preserves the full Error
   identity but reintroduces the marshal-table dependency that
   Alternative 1 was rejected for.
   Recommendation: plain shape for now; revisit if richer Error preservation
   is needed.

## Prompt

> Please dispatch a subagent to produce a test that reliably reproduces the
> `{}` symptom for an Error. Then dispatch a designer to propose a solution.

(kriskowal at 2026-05-10T06:16:14Z on
[issue #171](https://github.com/endojs/endo-but-for-bots/issues/171))
