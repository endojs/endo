# Form Capability Design

## Summary

Hosts and guests can send a message containing a **form capability**.
The receiver can fill out the form (submit responses) or forward the form
to another party.
Each form submission is delivered to the proposer as a message containing
the response.
A form capability is no more than a **record** that can be sent like any
other value; UIs (chat and CLI) recognize it and generate a form with a
Submit verb from its pattern.
This document covers daemon, CLI, chat, and patterns.

---

## 1. What is a form capability?

A form capability is a **record** (passable data) containing:

- **Proposer handle** (for replying): A reference to the agent who created
  the form; the recipient sends the filled response to this handle.
- **Title** (string): A short label for the form (e.g. "Feedback", "Order
  form").
- **Description** (string): Human-readable explanation of what the form is
  for.
- **Pattern** (serializable): The expected shape of the response (from
  `@endo/patterns`); UIs use it to generate fields and validate
  submissions.

Nothing more is required.
The form is sent in a package message like any other value (e.g. as one
edge in the package).
The receiver (or their UI) uses the record to render the form and, on
Submit, sends a reply message to the proposer handle containing the
payload that matches the pattern.
Forwarding is just sending the same record (or a copy) in another package
to someone else; they see the same title, description, and pattern and
reply to the same proposer.

---

## 2. Goals

- **Form as data**: A form is a record, not a special capability with
  methods; it can be sent in messages like any passable value.
- **Pattern-driven UI**: The form's pattern describes the response shape;
  chat and CLI derive a graphical or CLI form from it.
- **Submit → reply to proposer**: Submitting the form means sending a
  message (e.g. a form-response) to the proposer handle with the
  validated payload.
- **Forward**: The receiver can forward the same form record to others;
  their submissions also go to the proposer.
- **Capability slots in pattern**: Fields that expect a capability
  (promise/remotable) get petname chips (or CLI petname/path) and
  optional human-readable description from the pattern or schema.

---

## 2. Preparatory Change: Patterns

### 2.1 Problem

Today patterns describe shape but not human-facing labels or descriptions.
For form UIs we need:

- Field labels (and optionally help text) for each key in a record
  pattern.
- For capability slots (`M.promise()`, `M.remotable()`, `M.eref()`): a
  short description of "what this slot is for" so the UI can show e.g.
  "Counter capability" next to a petname chip.

### 2.2 Options

**Option A – Form schema separate from pattern**

- Define a **form descriptor** type: `{ pattern: Pattern, fields?:
  Array<{ key: string, label?: string, description?: string }> }` or a
  record of key → `{ label?, description? }`.
- The pattern alone describes the valid shape; the descriptor adds UI
  hints.
  No change to `@endo/patterns`.
- Serialization: we must serialize the pattern for the wire.
  Patterns in Endo have an internal payload (e.g. tagged structure).
  We could define a canonical JSON (or passable) encoding for "form
  schema" that includes pattern payload + labels.

**Option B – Extend patterns with optional metadata**

- Add optional metadata to pattern constructors, e.g. `M.string({
  label: 'Name', description: 'Your display name' })` or a wrapper
  `M.formField(M.string(), { label: 'Name' })`.
- For capability slots: `M.promise(M.interface('Counter', {...}), {
  description: 'A counter capability' })` or `M.remotable('Counter', {
  description: '...' })`.
- Requires changes to `@endo/patterns` and a serialization story for the
  extended pattern (so that chat/CLI can render the form without having
  the live pattern object).

**Option C – Convention over pattern**

- Form "schema" is a **record pattern** only.
  Keys are field names; we humanize keys as labels (e.g. `resultName` →
  "Result name").
  No description for capability slots unless we add a parallel structure
  (e.g. a separate `descriptions: { fieldName: '...' }` in the form
  descriptor).
- Capability slots: use `M.promise()` or `M.remotable(tag)`.
  The **tag** (e.g. `'Counter'`) can be used as the human-readable hint;
  no API change if we only need "label from key" and "hint from remotable
  tag".

**Recommendation**

- Start with **Option A** or **C** to avoid blocking on patterns
  changes: a **form descriptor** (serializable) that pairs a pattern with
  optional labels/descriptions.
  The descriptor is what gets sent in the daemon and rendered in
  chat/CLI.
- If we want "description for capability slot" without a separate
  descriptor map, add a small **Option B**-style extension in
  `@endo/patterns`: e.g. allow an optional second argument or options
  bag on `M.promise(inner, { description: '...' })` and
  `M.remotable(tag, { description: '...' })` used only for form UI.
  Serialization: include in the form descriptor as
  `fieldDescriptions: { path: string }` or per-key metadata.

### 2.3 Serializable form schema

Whatever we choose, the daemon and UIs need a **serializable form schema**
that can cross the wire (e.g. in a message or as part of a form
capability).
It should include:

- **Shape**: Enough to reconstruct or interpret the pattern (e.g. a
  canonical JSON representation of the pattern payload, or a simplified
  "form shape" that only supports record-of-fields).
- **Labels** (optional): `Record<string, string>` for field label by key
  (or path).
- **Descriptions** (optional): `Record<string, string>` for help text or
  capability-slot description by key.

For **record patterns** (the common case for forms), we can define a
minimal schema:

```ts
FormFieldSchema =
  | { kind: 'string', label?: string, description?: string }
  | { kind: 'number', label?: string, description?: string }
  | { kind: 'boolean', label?: string, description?: string }
  | { kind: 'bigint', label?: string, description?: string }
  | { kind: 'record', fields: Record<string, FormFieldSchema>, label?: string }
  | { kind: 'array', element: FormFieldSchema, label?: string }
  | { kind: 'capability', tag?: string, description?: string, label?: string };  // promise/remotable slot

FormSchema = {
  type: 'record';
  fields: Record<string, FormFieldSchema>;
  labels?: Record<string, string>;
  descriptions?: Record<string, string>;
};
```

Conversion from `M.record(...)` (or splitRecord) to `FormSchema` can live
in a small library (e.g. in daemon or a shared package); if we add
optional metadata to patterns later, the converter can read it into
`labels`/`descriptions`.

---

## 3. Daemon

### 3.1 Form as record (no special capability)

A form capability is **just a record**; the daemon does not need to
provide a special "Form" capability type or a `createForm()` API.
Any agent can construct a form record and send it in a **package**
message like any other value.

The record contains:

- **proposer** (handle): Reference to the agent who created the form; the
  recipient uses this to reply.
- **title** (string): Short label for the form.
- **description** (string): Human-readable explanation.
- **pattern** (serializable): Expected response shape (e.g. FormSchema);
  UIs use it to render fields and validate submissions.

Sending a form is existing behaviour: put this record in a package (e.g.
as one of the edges) and send it to the recipient.

### 3.2 Submitting a form (reply to proposer)

To submit, the receiver sends a **reply** to the proposer handle with a
payload that matches the pattern.
That reply can be delivered as a distinct message type so the proposer's
inbox can show "Form response from X" and the UI can render it
appropriately.

Options:

- **New message type "form-response"**: The mailbox (or a small extension)
  supports sending a form-response to a handle; the proposer's mailbox
  delivers it as a message of type `form-response` with `from`, `to`,
  `payload`, and stamped fields.
  Validation (payload matches pattern) can happen when sending, or the
  proposer validates when handling.
- **Reuse package**: The receiver sends a package message to the proposer
  containing the payload (e.g. as a structured attachment or as
  edge names + values).
  The proposer sees a normal package; convention or heuristics identify
  it as a form response.

A new message type keeps form responses explicit and simplifies UI
(render "Form response" vs "Message").

### 3.3 Form-response message type (if used)

If the daemon supports a distinct form-response message:

```ts
FormResponse = {
  type: 'form-response';
  from: string;             // submitter
  to: string;              // proposer
  payload: unknown;        // validated against form pattern
  date: string;
  // ... stamped fields (number, dismissed, dismisser, etc.)
};
```

Delivery: when the receiver calls something like
`E(mailbox).sendFormResponse(proposerHandle, payload)` (or
`E(proposerHandle).receiveFormResponse(payload)` if the proposer exposes
that), the proposer's mailbox appends a form-response message.
Validation of `payload` against the pattern can occur in the sender's
mailbox before sending, or the proposer validates on receipt.

### 3.4 No createForm required

The proposer does not need to "create" a form with the daemon; they
construct the record (proposer = self, title, description, pattern) and
send it.
If we add `sendFormResponse`, that is the only new mailbox (or host)
API: a way for the receiver to send a form-response to a handle so it
arrives in that handle's mailbox as a form-response message.

---

## 4. CLI

### 4.1 Receiving a form (inbox)

- When the CLI lists/follows messages and sees a **package** message that
  includes a form record (e.g. one of the edges is a value that has
  proposer, title, description, pattern), it can:
  - **Fill out**: Use the form's pattern (or FormSchema) to render a CLI
    form (prompts per field), then send a form-response (or package) to
    the proposer handle with the payload.
  - **Forward**: Send the same form record to another recipient (existing
    send flow; form is just a value in a package).

### 4.2 Rendering a form from pattern (CLI)

- For each field in the form's pattern (or FormSchema.fields):
  - `string` → prompt for a line (or multi-line if we add a hint).
  - `number` → prompt and parse number.
  - `boolean` → yes/no prompt.
  - `bigint` → prompt and parse bigint.
  - `record` → nested prompts (e.g. "field.subfield").
  - `array` → repeat prompt "add item?" and collect elements (or simple
    "comma-separated" for array of strings).
  - `capability` → prompt for pet name (or path) in the agent's
    directory; resolve to a capability and pass that as the value.
    Optionally show `description` from schema as hint.
    If we support "ad hoc" capability identifiers (e.g. locator URL),
    allow that as alternative input.

- **Submit** verb: After collecting all required fields, send a
  form-response (or package) to the form's proposer handle with the
  payload.
  On success, show "Form submitted." and optionally dismiss the message.

### 4.3 Showing form-response messages

- When the CLI shows a message of type `form-response`, display: from,
  date, and a summary of `payload` (e.g. JSON or pretty-printed
  key/value).
  Option to dismiss.

### 4.4 Commands (optional)

- `/formsubmit <messageNumber>` or similar: for a message that contains a
  form record, open the CLI form from its pattern and on submit send the
  reply to the proposer.
  Alternatively the inbox view can have a "Fill form" action per message
  that contains a form.

---

## 5. Chat

### 5.1 Receiving a form (inbox)

- When the chat inbox renders a **package** message and one of the edges
  is a form record (a value with proposer, title, description, pattern –
  e.g. duck-typing on shape, or the sender uses an edge name like
  `"form"`).
- **Fill out**: Show a card with the form's **title** and **description**,
  and a **Fill out** button.
  On click, use the form's pattern to render an inline or modal form (see
  below), and on **Submit** send a form-response (or package) to the
  form's proposer handle with the payload.
- **Forward**: Button "Forward" that opens send composer with the form
  record attached (like current "send with reference").

### 5.2 Rendering a form from pattern (chat)

- Use the form's **pattern** (or FormSchema) to build a UI form:
  - **string** → `<input type="text">` or `<textarea>` (if we add
    maxLength or multiline hint).
  - **number** → `<input type="number">`.
  - **boolean** → `<input type="checkbox">` or toggle.
  - **bigint** → `<input type="text">` with validation.
  - **record** → fieldset with nested inputs.
  - **array** → list of inputs + "Add item" / remove.
  - **capability** → petname chip input (like current `@` token): user
    types `@` and selects a pet name (or path); the value is the
    capability at that name.
    Show `description` or `tag` as placeholder/label (e.g. "Counter
    capability").

- **Submit** button: Validate client-side (if we have a lightweight
  validator) or send payload to the proposer; if the daemon validates and
  rejects, show error.
  On success, show "Submitted" and optionally dismiss the message.

### 5.3 Form-response messages in inbox

- When the inbox shows a message of type `form-response`, render it like
  a small card: "Form response from @alice" and a summary or expandable
  payload (key/value or JSON).
  Dismiss button.

### 5.4 Request vs form

- **Request**: Current request message has `description: string`;
  resolve/reject with a **single** capability (pet name).
  No structured payload.
- **Form**: A form is a **record** (proposer, title, description, pattern)
  sent in a package; the receiver fills a **structured payload** that
  matches the pattern.
  Submit sends that payload back as a form-response (or package) to the
  proposer handle.
- So we do **not** replace request with form; we add form as a kind of
  value (a record) and optionally a new message type (form-response) for
  the reply.
  Request remains for "please give me a capability (with a description)".

---

## 6. Pattern-to-UI mapping (summary)

| Pattern / kind   | HTML-like input (chat)     | CLI                    | Passable value        |
|------------------|----------------------------|------------------------|------------------------|
| string           | `<input type="text">`      | Prompt line            | string                 |
| number           | `<input type="number">`    | Prompt, parse number   | number                 |
| boolean          | Checkbox / toggle          | Yes/no                 | boolean                |
| bigint           | `<input type="text">`      | Prompt, parse bigint   | bigint                 |
| record           | Fieldset, nested inputs    | Nested prompts         | copyRecord             |
| array            | List + add/remove          | Repeat or comma-sep    | copyArray              |
| capability       | Petname chip (`@name`)     | Pet name or path       | capability (promise)   |

For **capability** slots, the value is always a reference (pet name or path
resolved to a capability, or in the future an ad hoc identifier).
The pattern's tag or description is used only for UI label/placeholder.

---

## 7. Preparatory change to patterns (optional, for nicer UX)

If we want capability slots to carry a human-readable description
**inside** the pattern:

- **M.promise(innerPattern?, options?)**: Allow `options.description`
  (string) for UI.
  Serialized form schema would include this as the capability field's
  `description`.
- **M.remotable(tag?, options?)**: Same; `options.description` for UI.
- **M.eref(pattern, options?)**: Same for the "expected capability" slot.

This is optional if we use a separate form descriptor (Option A) that
maps field paths to labels and descriptions.

---

## 8. Implementation order (suggested)

1. **Form record shape and pattern serialization** (shared or daemon):
   Define the form record type (proposer, title, description, pattern)
   and a serializable pattern representation (e.g. FormShape) for UIs.
2. **Daemon – form-response (if used)**: Add a way to send a form-response
   to a handle (e.g. `sendFormResponse(proposerHandle, payload)`) and
   deliver it as a message of type `form-response` in the proposer's
   mailbox.
3. **CLI – inbox**: Detect form record in package messages; "Fill form"
   flow: render from pattern → CLI prompts → send reply to proposer.
   Show form-response messages.
4. **Chat – inbox**: Detect form record in package; "Fill out" and
   "Forward".
   Render form from pattern (title, description, fields from FormShape).
   Show form-response messages.
5. **Patterns (optional)**: Add optional description/label metadata for
   capability slots and/or form-field helpers; wire into FormShape
   conversion.

---

## 9. Open questions

- **Form identity**: Do we need a stable form id (e.g. in the form record)
  so the proposer can correlate responses to a specific form instance?
  A form-response message could include a form id if the form record
  carries one.
- **Ad hoc capability identifiers**: Should the CLI/chat allow pasting a
  locator (or other identifier) for a capability slot instead of only pet
  names?
  That would require a way to resolve the identifier to a capability in the
  agent's context; may be a follow-up.
- **Optional vs required fields**: FormSchema could mark fields as
  optional (e.g. from `M.opt()` or splitRecord optional part); UI should
  only require required fields and allow blank for optional.
- **Validation**: Should validation (payload matches pattern) happen when
  sending the form-response (sender or daemon), or when the proposer
  handles the message?
