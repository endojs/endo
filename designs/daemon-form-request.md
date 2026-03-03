# Daemon Form

| | |
|---|---|
| **Created** | 2026-02-25 |
| **Updated** | 2026-03-02 |
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
   A form lets the host see exactly what is being asked and fill in values
   with validation.
3. **Multi-field input.** Some interactions require several related values at
   once (e.g., name + email + role for an invitation). Collecting these one
   at a time through separate messages is fragile and hard to correlate.

The form message type solves this by letting any agent send a structured form
to any other agent. The form carries a description and a set of named fields
with labels. Recipients respond by submitting values, which arrive as `value`
messages replying to the original form. A form can be submitted any number of
times.

## Current Implementation

The feature is implemented across the daemon, CLI, type system, and Chat UI.

### Type Definitions

`packages/daemon/src/types.d.ts`

The `Form` message type (line 412):

```ts
export type FormField = { label: string; pattern?: unknown };

export type Form = MessageBase & {
  type: 'form';
  replyTo?: FormulaNumber;
  description: string;
  fields: Record<string, FormField>;
};
```

Each field has a `label` (display text) and an optional `pattern` (a
Passable pattern as defined by `@endo/patterns`). When `pattern` is omitted,
the daemon treats it as `M.string()` — the field accepts any string value.

`Form` is included in the `Message` union type (line 449) and in the
`MessageFormula` persistence type (line 272), which means form messages
survive daemon restarts.

The `Mail` interface exposes two methods:

- `form(recipientNameOrPath, description, fields)` — send a form (line 701).
- `getForm(messageNumber)` — retrieve a received form's description, fields,
  and guestHandleId (line 713).

The `EndoGuest` interface exposes `form()` (line 859) and the `EndoHost`
interface exposes `submit()` (line 936).

### Sending a Form — `mail.js`

`packages/daemon/src/mail.js`

**`makeForm`** (line 277) creates the message envelope:

1. Generates a random `messageId` via `randomHex256()`.
2. Returns the form message object with `type: 'form'`, `description`, and
   `fields`.

No promise or resolver is allocated. The form is fire-and-forget from the
sender's perspective.

**`form`** (line 1299) is the guest-facing method:

1. Resolves the recipient name to a handle.
2. Calls `makeForm` to create the envelope.
3. Posts the form to the recipient via `post(to, req)`.
4. Returns. Does not block or print output.

The caller discovers responses by watching for `value` messages whose
`replyTo` matches the form's `messageId`.

### Submitting a Form — `host.js`

`packages/daemon/src/host.js`

**`submit`** (line 835):

1. Calls `mailbox.getForm(messageNumber)` to retrieve the form's `fields`.
2. Validates that every field key in `fields` has a corresponding entry in
   `values`. Throws if any field is missing.
3. Validates each value against the field's `pattern` using `mustMatch()`.
   Fields with no explicit `pattern` default to `M.string()`. Throws if any
   value does not match.
4. Marshals the `values` record via `formulateMarshalValue` so it can be
   stored as a formula.
5. Sends a `value` message with `replyTo` pointing to the form's `messageId`,
   carrying the marshalled values as the `valueId`.

Because `submit` sends a `value` message reply rather than resolving a
promise, it can be called any number of times on the same form. Each
submission produces a new `value` message in the reply chain.

### Retrieving a Form — `mail.js`

`packages/daemon/src/mail.js`

**`getForm`** (line 1372):

1. Looks up the message by number.
2. Asserts the message type is `'form'`.
3. Returns `{ description, fields, guestHandleId }`.

### Interface Guards

`packages/daemon/src/interfaces.js`

Guest `form()` guard (line 207):

```js
form: M.call(
  NameOrPathShape,  // recipientName
  M.string(),       // description
  M.record(),       // fields
)
  .returns(M.promise()),
```

Host `submit()` guard (line 334):

```js
submit: M.call(
  MessageNumberShape,  // messageNumber
  M.record(),          // values
).returns(M.promise()),
```

### Help Text

`packages/daemon/src/help-text.js`

Guest `form` help (line 264):

```
form(recipientName, description, fields) -> void
Send a structured form to another agent.
The recipient submits values by responding, which arrive as value messages.
```

Host `submit` help (line 434):

```
submit(messageNumber, values) -> Promise<void>
Submit values for a form. Sends a value message reply to the form.
Can be called multiple times on the same form.
```

### CLI Commands

`packages/cli/src/endo.js`

**`endo form`** (line 335):

```
endo form <recipient> <description> \
  --as <agent-name> \
  --field <field>  (repeatable, format "fieldName:label")
```

The command sends the form and returns. It does not print output or block
waiting for a response.

**`endo submit`** (line 361):

```
endo submit <message-number> \
  --as <agent-name> \
  -f, --field <field>  (repeatable, format "fieldName:value")
```

Sends a `value` message reply to the form. Can be called multiple times.

### CLI Command Implementations

**`packages/cli/src/commands/form.js`** — parses `--field` arguments as
`fieldName:label` pairs using the first colon as delimiter, calls
`E(agent).form()`.

**`packages/cli/src/commands/submit.js`** — parses `--field` (`-f`) arguments
as `fieldName:value` pairs, calls `E(agent).submit()`, which sends a
`value` message reply.

### CLI Inbox Display

`packages/cli/src/commands/inbox.js`

Form messages are displayed in the inbox (line 112):

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
  --field "projectName:Project name" \
  --field "apiKey:API key"

# Host sees the form in their inbox
endo inbox
# => 0. "fae" sent form "Configure project settings" (fields: projectName, apiKey) at "..."

# Host submits values
endo submit 0 \
  -f "projectName:my-app" \
  -f "apiKey:sk-1234"
# Sends a value message replying to form #0

# The value message appears in the guest's inbox
endo inbox --as fae
# => 1. "HOST" sent value in reply to #0 at "..."

# Host can submit again with corrected values
endo submit 0 \
  -f "projectName:my-app" \
  -f "apiKey:sk-5678"
# Sends another value message replying to form #0
```

Forms can be submitted any number of times. Each submission produces a
`value` message (see [daemon-value-message](daemon-value-message.md)) in the
reply chain. The caller discovers responses by watching for `value` messages
whose `replyTo` matches the form's `messageId`.

## Gaps

### No forwarding or sharing

A host cannot forward a form to another agent for them to answer. The form
is delivered to the original recipient's mailbox only.

### `replyTo` and `messageId` should use `FormulaIdentifier`

The `replyTo` and `messageId` fields on `MessageBase` are typed as
`FormulaNumber` (node-local), not `FormulaIdentifier` (node-qualified). This
is safe in the current single-node implementation but will not generalize to
multi-node messaging where a reply may reference a message on a different
node. All message types that inherit from `MessageBase` — including `Form` —
should migrate `replyTo` and `messageId` to `FormulaIdentifier` for forward
safety.

### Limited pattern vocabulary

The daemon validates field values against patterns, but only a small set of
patterns (`M.string()`, `M.number()`, `M.boolean()`, `M.scalar()`) have
corresponding Chat UI widgets. Richer patterns (e.g., `M.or()`,
`M.arrayOf()`, record shapes) are validated server-side but have no
specialized input rendering — they fall back to a text input. The CLI has
no way to specify patterns; all fields default to `M.string()`.

### CLI values are strings only

The CLI `--field` parser produces `Record<string, string>`. The daemon's
`submit` accepts `Record<string, unknown>` and marshals arbitrary passables,
but the CLI cannot express numbers, booleans, or references.

### No reusable form templates

Each `form()` call constructs the fields inline. There is no way to define a
form template once and reuse it across multiple requests, or to share form
definitions between agents.

## Design Decisions

1. **Multi-submission via value replies.** Instead of the single-response
   promise/resolver pattern, form submissions produce `value` messages
   replying to the original form. This allows any number of responses: the
   host can correct mistakes, multiple agents can respond if the form is
   forwarded, and the reply chain provides a natural history of submissions.
   See [daemon-value-message](daemon-value-message.md).

2. **Fire-and-forget sending.** `form()` sends the form and returns
   immediately. It does not allocate a promise or block waiting for a
   response. Callers discover responses by watching for `value` messages
   with matching `replyTo`. This simplifies the internal machinery — no
   `formulatePromise`, no `PROMISE`/`RESOLVER`/`RESULT` edges in the message
   hub.

3. **Daemon-enforced field patterns.** The daemon validates each submitted
   value against its field's `pattern` using `mustMatch()`. Fields with no
   explicit `pattern` default to `M.string()`. If a value does not match,
   `submit` throws — patterns are a contract, not a hint. The Chat UI uses
   the same patterns to select appropriate input widgets (text, number,
   checkbox), providing client-side guidance that complements server-side
   enforcement.

4. **Values support capability references.** Form values are full passables,
   including capability references resolved from pet names. This enables use
   cases like "which worker should I use?" where the answer is a live
   reference. The CLI's string-only limitation is a CLI concern, not a
   daemon design constraint.

5. **No form templates.** Forms are always constructed inline in each
   `form()` call. Agents can build their own abstractions for reuse. No new
   formula type needed.

6. **`/submit` command in Chat UI.** The `/submit` command takes a message
   number, opens a modal pre-populated with the form's field labels and
   input fields, and calls `E(host).submit()` on confirmation. This
   parallels `/form` for sending and `/submit` for responding. The same
   form can be submitted multiple times — each `/submit` opens a fresh
   instance of the form. The form view generator selects the input widget
   for each field based on its `pattern`:

   | Pattern | Widget |
   |---------|--------|
   | `M.string()` (or omitted) | Text input |
   | `M.number()` | Number input |
   | `M.boolean()` | Checkbox |
   | `M.remotable()` | Pet name path selector |
   | `M.promise()` | Pet name path selector |
   | `M.scalar()` | Text input (passable scalar) |

   The pet name path selector lets the user browse and pick from their pet
   store, resolving the selected name to a capability reference on
   submission. The number input may infer additional constraints from the
   pattern — for example, `M.gte(0)` or `M.lte(100)` guards composed with
   `M.number()` can set `min` and `max` attributes on the HTML input.
   Unrecognized patterns fall back to a text input. This mapping is
   extensible as new patterns are introduced.

7. **Modal form builder for `/form` command.** Sending a form uses a modal
   dialog (like the `/js` eval form) with a recipient picker, description
   field, dynamic "Add field" button for name+label rows. The `--name` option
   for response naming is removed since form responses are no longer
   promise-based. The modal pattern handles the variable number of fields
   naturally, following the established eval-form endowments UI pattern.

8. **Inline form rendering in inbox.** Form messages render in the message
   stream showing the description and field labels. The inline display is
   read-only — submission is done via the `/submit` command. Previous
   submissions appear as `value` messages in the reply chain below the form.

9. **Simplified internals.** `makeForm` generates a `messageId` and envelope
   without allocating any promise/resolver pair. `makeStampedMessage` does
   not reconstruct promises for form messages. `makeMessageFormula` does not
   store `promiseId` or `resolverId`. The message hub registers only
   `DESCRIPTION` and standard edges (`FROM`, `TO`, `DATE`, `TYPE`,
   `MESSAGE`) — no `PROMISE`, `RESOLVER`, or `RESULT` edges.

## Related Designs

- [daemon-value-message](daemon-value-message.md) — value messages are the
  reply mechanism for form submissions. Each `submit` call produces a value
  message with `replyTo` pointing to the form.
- [daemon-capability-persona](daemon-capability-persona.md) — persona/epithet
  system; forms could carry sender identity information.
- [daemon-capability-bank](daemon-capability-bank.md) — capability
  management; forms could be the mechanism for requesting capability
  configurations.
