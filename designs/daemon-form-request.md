# Daemon Form Request

| | |
|---|---|
| **Date** | 2026-02-25 |
| **Author** | Kris Kowal (prompted) |
| **Status** | In Progress |

## What is the Problem Being Solved?

Endo agents communicate through a message-passing inbox system that currently
supports free-text requests, code evaluation proposals, and package sends.
None of these message types provide a way for an agent to ask a structured
question — one with named fields, labels, and eventually typed constraints —
and receive a structured answer.

This matters for three scenarios:

1. **LLM agent configuration.** An AI coding agent needs API keys, project
   paths, or preference settings from the user. Today it must parse free-text
   responses or rely on the host to pre-configure values.
2. **Capability requests with parameters.** A guest requesting access to a
   resource may need to specify parameters (port number, file path, scope).
   A form request lets the host see exactly what is being asked and fill in
   values with validation.
3. **Multi-field input.** Some interactions require several related values at
   once (e.g., name + email + role for an invitation). Collecting these one
   at a time through separate messages is fragile and hard to correlate.

The form-request message type solves this by letting any agent send a
structured form to any other agent. The form carries a description, a set of
named fields with labels, and a promise that resolves when the recipient
responds with values.

## Current Implementation

The feature is partially implemented across the daemon, CLI, and type system.
The Chat UI has no support.

### Type Definitions

`packages/daemon/src/types.d.ts`

The `FormRequest` message type (line 412):

```ts
export type FormRequest = MessageBase & {
  type: 'form-request';
  replyTo?: FormulaNumber;
  description: string;
  fields: Record<string, { label: string; pattern?: unknown }>;
  promiseId: FormulaIdentifier;
  resolverId: FormulaIdentifier;
  settled: Promise<'fulfilled' | 'rejected'>;
};
```

`FormRequest` is included in the `Message` union type (line 449) and in the
`MessageFormula` persistence type (line 272), which means form-request
messages survive daemon restarts.

The `Mail` interface exposes two methods:

- `form(recipientNameOrPath, description, fields, responseName?)` — send a
  form request (line 701).
- `getFormRequest(messageNumber)` — retrieve a received form request's
  description, fields, resolverId, and guestHandleId (line 713).

The `EndoGuest` interface exposes `form()` (line 859) and the `EndoHost`
interface exposes `respondForm()` (line 936).

### Sending a Form — `mail.js`

`packages/daemon/src/mail.js`

**`makeFormRequest`** (line 277) creates the message envelope:

1. Generates a random `messageId` via `randomHex256()`.
2. Allocates a promise/resolver pair via `formulatePromise(pinTransient)`.
3. Starts a `settled` promise that resolves to `'fulfilled'` or `'rejected'`.
4. Returns `{ request, response }` where `response` is a promise that
   resolves with the formula identifier of the marshalled response values.

**`form`** (line 1299) is the guest-facing method:

1. Resolves the recipient name to a handle.
2. If `responseName` is provided and already exists, returns the existing
   value (idempotent retry).
3. Calls `makeFormRequest` to create the envelope and response promise.
4. Posts the request to the recipient via `post(to, req)`.
5. Unpins the transient promise and resolver after posting.
6. Awaits the response promise, which resolves when the recipient calls
   `respondForm`.
7. Optionally writes the response to the sender's pet store under
   `responseName`.

### Responding to a Form — `host.js`

`packages/daemon/src/host.js`

**`respondForm`** (line 835):

1. Calls `mailbox.getFormRequest(messageNumber)` to retrieve the form's
   `fields` and `resolverId`.
2. Validates that every field key in `fields` has a corresponding entry in
   `values`. Throws if any field is missing.
3. Marshals the `values` record via `formulateMarshalValue` so it can be
   stored as a formula.
4. Resolves the form's promise: `E.sendOnly(resolver).resolveWithId(marshalledId)`.

### Retrieving a Form — `mail.js`

`packages/daemon/src/mail.js`

**`getFormRequest`** (line 1372):

1. Looks up the message by number.
2. Asserts the message type is `'form-request'`.
3. Returns `{ description, fields, resolverId, guestHandleId }`.

### Interface Guards

`packages/daemon/src/interfaces.js`

Guest `form()` guard (line 207):

```js
form: M.call(
  NameOrPathShape,  // recipientName
  M.string(),       // description
  M.record(),       // fields
)
  .optional(NameOrPathShape)  // responseName
  .returns(M.promise()),
```

Host `respondForm()` guard (line 334):

```js
respondForm: M.call(
  MessageNumberShape,  // messageNumber
  M.record(),          // values
).returns(M.promise()),
```

### Help Text

`packages/daemon/src/help-text.js`

Guest `form` help (line 264):

```
form(recipientName, description, fields, responseName?) -> Promise<Record>
Send a structured form request to another agent.
The recipient fills out the form fields and the result is returned as a record.
```

Host `respondForm` help (line 434):

```
respondForm(messageNumber, values) -> Promise<void>
Respond to a structured form request with values.
```

### CLI Commands

`packages/cli/src/endo.js`

**`endo form`** (line 335):

```
endo form <recipient> <description> \
  --as <agent-name> \
  --name <result-name> \
  --field <field>  (repeatable, format "fieldName:label")
```

**`endo respond-form`** (line 361):

```
endo respond-form <message-number> \
  --as <agent-name> \
  --value <value>  (repeatable, format "fieldName:value")
```

### CLI Command Implementations

**`packages/cli/src/commands/form.js`** — parses `--field` arguments as
`fieldName:label` pairs using the first colon as delimiter, calls
`E(agent).form()`, and prints the result.

**`packages/cli/src/commands/respond-form.js`** — parses `--value` arguments
as `fieldName:value` pairs, calls `E(agent).respondForm()`.

### CLI Inbox Display

`packages/cli/src/commands/inbox.js`

Form-request messages are displayed in the inbox (line 112):

```
3. "HOST" sent form "Configure settings" (fields: name, email) at "2026-02-25T..."
```

The verb `'sent form'` is assigned at line 42.

## What Works Today

The end-to-end flow is functional via CLI:

```bash
# Guest "fae" asks Host for configuration
endo form HOST "Configure project settings" \
  --as fae \
  --name project-config \
  --field "projectName:Project name" \
  --field "apiKey:API key"

# Host sees the form in their inbox
endo inbox
# => 0. "fae" sent form "Configure project settings" (fields: projectName, apiKey) at "..."

# Host responds with values
endo respond-form 0 \
  --value "projectName:my-app" \
  --value "apiKey:sk-1234"

# The guest's form() promise resolves with { projectName: "my-app", apiKey: "sk-1234" }
# If --name was provided, the result is stored under that pet name
```

The promise/resolver lifecycle ensures the guest blocks until the host
responds. The `settled` promise on the message lets the inbox UI track
whether a form has been answered.

## Gaps

### No Chat UI support

The `packages/chat/` directory contains no references to `form-request`,
`respondForm`, or any form-related rendering. Users of the Familiar Electron
app cannot see form requests in their inbox or respond to them.

This is the most significant gap. Chat UI needs:

- Rendering form-request messages with field labels and a response form.
- A submission mechanism that calls `E(host).respondForm()`.
- Visual indication of whether the form has been answered (`settled`).

### No tests

Neither `packages/daemon/test/` nor `packages/cli/test/` contain any
form-request test coverage. The feature has no regression protection.

Tests should cover:

- Guest sends form, host responds, guest receives values.
- Validation: host response missing a field is rejected.
- Idempotent retry: calling `form()` with an existing `responseName` returns
  the stored value.
- Message persistence across daemon restart.
- CLI argument parsing edge cases (colons in labels/values).

### Single-response only

The promise/resolver pattern means each form can only be answered once. If
the host makes a mistake, there is no way to amend the response. The
`settled` promise transitions to `'fulfilled'` permanently.

### No forwarding or sharing

A host cannot forward a form-request to another agent for them to answer.
The `resolverId` is bound to the original recipient's mailbox.

### `replyTo` and `messageId` should use `FormulaIdentifier`

The `replyTo` and `messageId` fields on `MessageBase` are typed as
`FormulaNumber` (node-local), not `FormulaIdentifier` (node-qualified). This
is safe in the current single-node implementation but will not generalize to
multi-node messaging where a reply may reference a message on a different
node. All message types that inherit from `MessageBase` — including
`FormRequest` — should migrate `replyTo` and `messageId` to
`FormulaIdentifier` for forward safety.

### Field type richness is unused

The `pattern` property on field definitions exists in the type system but is
never validated. `respondForm` checks only that every field key is present,
not that the value matches any pattern. The CLI has no way to specify
patterns.

### CLI values are strings only

The CLI `--value` parser produces `Record<string, string>`. The daemon's
`respondForm` accepts `Record<string, unknown>` and marshals arbitrary
passables, but the CLI cannot express numbers, booleans, or references.

### No reusable form templates

Each `form()` call constructs the fields inline. There is no way to define a
form template once and reuse it across multiple requests, or to share form
definitions between agents.

### No chat command syntax

There is no `/form` or `/respond-form` command in the Chat UI command
vocabulary. Even before full UI rendering, a command-based interface could
provide basic functionality.

## Design Decisions

1. **Single-response only.** Keep the current promise/resolver pattern. One
   response per form. If the host makes a mistake, the guest must send a new
   form. This matches the existing request/resolve model and avoids the
   complexity of mutable stores.

2. **Daemon-enforced field patterns.** The daemon should validate each value
   against its field's `pattern` before resolving the form promise. If a
   value does not match, `respondForm` rejects with an error. This makes
   patterns a contract, not just a hint.

3. **Values support capability references.** Form values are full passables,
   including capability references resolved from pet names. This enables use
   cases like "which worker should I use?" where the answer is a live
   reference. The CLI's string-only limitation is a CLI concern, not a
   daemon design constraint.

4. **No form templates.** Forms are always constructed inline in each
   `form()` call. Agents can build their own abstractions for reuse. No new
   formula type needed.

5. **Inline form widget in Chat UI.** Form-request messages render as
   labeled input fields directly in the message stream, with a submit button
   that calls `respondForm()`. Settled forms display the submitted values
   read-only.

## Related Designs

- [daemon-capability-persona](daemon-capability-persona.md) — persona/epithet
  system; forms could carry sender identity information.
- [daemon-capability-bank](daemon-capability-bank.md) — capability
  management; forms could be the mechanism for requesting capability
  configurations.
