# Lal/Fae Form-Based Provisioning

| | |
|---|---|
| **Created** | 2026-03-02 |
| **Updated** | 2026-03-02 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

Today, Lal and Fae receive their LLM configuration — model name, API host, and
auth token — from environment variables (`LAL_HOST`, `LAL_MODEL`,
`LAL_AUTH_TOKEN`) passed through their `setup.js` scripts at install time. This
has three problems:

1. **Configuration is baked in at provisioning.** Changing the model or API key
   requires re-running the setup script with new environment variables. There
   is no in-band way to reconfigure the agent.

2. **Only one agent identity per install.** Each `setup.js` creates exactly one
   guest profile (`profile-for-lal` or `profile-for-fae`) with a fixed name.
   To run multiple independent agent personas — each with its own name, inbox,
   and pet store — the user must manually duplicate and edit setup scripts.

3. **No user consent flow.** The agent starts following its inbox immediately
   with whatever configuration the environment provided. The root user has no
   opportunity to review, approve, or customize the agent's identity before it
   begins operating.

The form system ([daemon-form-request](daemon-form-request.md)) and value
message replies ([daemon-value-message](daemon-value-message.md)) provide the
primitives to solve this. Instead of reading environment variables, the agent's
first act should be to send the root user a form asking for configuration. Each
form submission creates a new guest profile with the user's chosen name and
starts an agentic loop following that guest's inbox.

## Design

### Overview

The refactored lifecycle has three layers:

1. **Setup script** — provisions a single "manager" guest profile with no LLM
   configuration. Launches the agent caplet under that profile.
2. **Manager agent** — sends a configuration form to HOST on startup, then
   watches for `value` message replies to that form. Each reply creates a new
   guest profile and spawns an agentic loop for it.
3. **Worker loops** — each spawned loop follows a specific guest's inbox and
   processes messages using the LLM configuration from the form submission.

```
                    ┌──────────┐
                    │  HOST    │
                    │ (root)   │
                    └────┬─────┘
                         │ form: "Add an agent"
                         │   fields: name, host, model, authToken
                         ▼
                    ┌──────────┐
                    │ Manager  │ (lal / fae)
                    │ Guest    │ profile-for-lal / profile-for-fae
                    └────┬─────┘
                         │ on each value reply:
                         │   provideGuest(name, ...)
                         │   spawn worker loop
                         ▼
              ┌──────────┴──────────┐
              ▼                     ▼
       ┌────────────┐        ┌────────────┐
       │ Guest "ada"│        │ Guest "bob"│
       │ worker loop│        │ worker loop│
       └────────────┘        └────────────┘
```

### Setup Script Changes

The setup script no longer reads `process.env` for LLM configuration. It
provisions only the manager guest and launches the agent caplet.

**`packages/lal/setup.js`** (after):

```js
import { E } from '@endo/eventual-send';

const lalSpecifier = new URL('agent.js', import.meta.url).href;

export const main = async agent => {
  await E(agent).provideGuest('lal', {
    introducedNames: {},
    agentName: 'profile-for-lal',
  });

  await E(agent).makeUnconfined('MAIN', lalSpecifier, {
    powersName: 'profile-for-lal',
    resultName: 'controller-for-lal',
  });
};
harden(main);
```

No `env` option. No `readConfig()`. No `storeValue` of config. The agent
caplet receives no `env` (or an empty object) and must obtain configuration
through the form flow.

Fae's `setup.js` changes identically, substituting `fae` / `profile-for-fae` /
`controller-for-fae`.

### Agent Startup: Sending the Configuration Form

On startup, instead of creating a provider and immediately following the inbox,
the agent sends a form to HOST:

```js
await E(powers).form('HOST', 'Add an agent', [
  { name: 'name', label: 'Agent name' },
  { name: 'host', label: 'API host', example: 'https://api.anthropic.com' },
  { name: 'model', label: 'Model name', example: 'claude-sonnet-4-6-20250514' },
  { name: 'authToken', label: 'API auth token' },
]);
```

The form's `messageId` becomes the anchor for all future submissions. The
manager then follows its own inbox, watching for `value` messages whose
`replyTo` matches this form's `messageId`.

### Form Fields

| Field | Label | Pattern | Required |
|-------|-------|---------|----------|
| `name` | Agent name | `M.string()` (default) | Yes |
| `host` | API host | `M.string()` (default) | Yes |
| `model` | Model name | `M.string()` (default) | Yes |
| `authToken` | API auth token | `M.string()` (default) | Yes |

All fields use the default `M.string()` pattern. The agent validates
non-empty values after receiving the submission. A future iteration could
use richer patterns (e.g., `M.and(M.string(), M.gte(1))` for non-empty
strings) once the pattern vocabulary supports it.

### Processing Form Submissions

The manager's inbox loop filters for `value` messages replying to the
configuration form. For each submission:

1. **Extract values.** The `value` message carries a marshalled
   `Record<string, string>` as its `valueId`. The manager looks up the value
   to obtain `{ name, host, model, authToken }`.

2. **Validate.** Assert that `name` is a non-empty string that is a valid pet
   name (no path separators, no reserved names like `SELF` or `HOST`).

3. **Check for duplicates.** If a guest with this name already exists (via
   `E(powers).has(name)` on the manager's pet store), skip creation and
   report the conflict back to HOST.

4. **Create guest profile.** Call `provideGuest` on the host agent to create
   a new guest with the chosen name:

   ```js
   const guest = await E(powers).provideGuest(name, {
     introducedNames: {},
     agentName: `profile-for-${name}`,
   });
   ```

   Wait — the manager is a *guest*, not the host. Guests cannot call
   `provideGuest`. Only the host can create other guests. This is a key
   architectural constraint.

### Architectural Constraint: Guest Cannot Create Guests

The `provideGuest` method is on the `EndoHost` interface, not `EndoGuest`.
A guest caplet (which is what the manager agent is) cannot directly create
new guest profiles.

**Resolution:** The manager agent requests that HOST create the guest on its
behalf. There are two approaches:

#### Option A: Evaluate Proposal

The manager sends an `evaluate` proposal to HOST that calls `provideGuest`:

```js
await E(powers).evaluate(
  undefined,                                    // workerName
  `E(AGENT).provideGuest(name, {               // source
    introducedNames: {},
    agentName: profileName,
  })`,
  ['name', 'profileName', 'AGENT'],            // codeNames
  [nameValue, profileNameValue, 'AGENT'],       // edgeNames
  guestPetName,                                 // resultName
);
```

This requires the HOST to review and grant the proposal. This is consistent
with Lal's existing eval-proposal workflow and provides explicit user consent
for each new guest creation.

**Drawback:** The user must grant every guest creation via eval-proposal
approval, which adds friction to what should feel like a simple form fill.

#### Option B: The Manager Asks HOST to Follow the Form

Instead of the manager creating guests, the manager sends the form, and HOST
(the root user) submits the form. When the manager receives the `value`
reply, it does not create the guest itself — it sends a `request` to HOST
asking for a guest with that name, or it uses a dedicated power.

**Drawback:** Requires a new capability or a multi-step request/response flow.

#### Option C: Grant the Manager a Host Power

The setup script introduces the `AGENT` power (the host formula) to the
manager guest. The manager can then call `E(agent).provideGuest(...)` using
the host reference.

This is already the pattern used in `setup.js` today — the setup script
*is* an unconfined caplet running with `--powers AGENT`, and it calls
`E(agent).provideGuest(...)`. The agent caplet itself could receive AGENT
as an introduced name.

**Resolution: Option C.** The setup script introduces AGENT to the manager
guest so it can create sub-guests. This is the simplest approach and
follows the existing pattern. The form submission from HOST already serves
as the consent mechanism — HOST chooses to submit the form, which triggers
guest creation.

### Revised Setup Script

```js
import { E } from '@endo/eventual-send';

const lalSpecifier = new URL('agent.js', import.meta.url).href;

export const main = async agent => {
  await E(agent).provideGuest('lal', {
    introducedNames: { AGENT: 'AGENT' },
    agentName: 'profile-for-lal',
  });

  await E(agent).makeUnconfined('MAIN', lalSpecifier, {
    powersName: 'profile-for-lal',
    resultName: 'controller-for-lal',
  });
};
harden(main);
```

The `introducedNames: { AGENT: 'AGENT' }` line gives the manager guest a
pet name `AGENT` that resolves to the host agent, enabling it to call
`E(agent).provideGuest(...)`.

### Manager Agent: Full Lifecycle

```js
export const make = (guestPowers, context) => {
  const powers = guestPowers;

  // 1. Send the configuration form to HOST.
  const formSent = E(powers).form('HOST', 'Add an agent', [
    { name: 'name', label: 'Agent name' },
    { name: 'host', label: 'API host', example: 'https://api.anthropic.com' },
    { name: 'model', label: 'Model name', example: 'claude-sonnet-4-6-20250514' },
    { name: 'authToken', label: 'API auth token' },
  ]);

  // 2. Resolve the host agent reference for provideGuest calls.
  const agentP = E(powers).lookup('AGENT');

  // 3. Track the form's messageId so we can identify replies.
  //    We discover it by watching our own outbound messages.
  let formMessageId;

  // 4. Track active worker loops by guest name.
  const activeWorkers = new Map();

  const runManager = async () => {
    await formSent;
    const agent = await agentP;
    const selfId = await E(powers).identify('SELF');

    const messageIterator = makeRefIterator(E(powers).followMessages());

    while (true) {
      const { value: message, done } = await messageIterator.next();
      if (done) break;

      // Capture the form's messageId from our own outbound message.
      if (message.from === selfId && message.type === 'form') {
        formMessageId = message.messageId;
        continue;
      }

      // Skip non-value messages and value messages not replying to our form.
      if (message.type !== 'value') continue;
      if (message.replyTo !== formMessageId) continue;

      // Extract the submitted values.
      const values = await E(powers).adopt(
        message.number, 'VALUE', `submission-${message.messageId}`,
      );
      const config = await E(powers).lookup(
        `submission-${message.messageId}`,
      );
      // config: { name, host, model, authToken }

      const { name } = config;

      // Skip if a worker is already running for this name.
      if (activeWorkers.has(name)) {
        await E(powers).reply(message.number,
          [`Agent "${name}" already exists.`], [], []);
        continue;
      }

      // Create the guest profile via the host agent.
      const guest = await E(agent).provideGuest(name, {
        introducedNames: {},
        agentName: `profile-for-${name}`,
      });

      // Spawn a worker loop for this guest.
      const workerP = spawnWorkerLoop(name, guest, config);
      activeWorkers.set(name, workerP);

      await E(powers).reply(message.number,
        [`Agent "${name}" is now running.`], [], []);
    }
  };

  // Fire and forget.
  runManager().catch(err =>
    console.error('[manager] Fatal:', err.message),
  );

  return makeExo('LalManager', LalManagerInterface, {
    help() {
      return 'Lal manager agent. Submit the configuration form to add agents.';
    },
  });
};
```

### Worker Loop: Following a Guest's Inbox

Each worker loop is the current agentic loop from `agent.js`, extracted into
a function that receives:

- `name` — the guest's pet name (for logging).
- `guest` — the `EndoGuest` far reference (for `followMessages`, `reply`,
  `send`, etc.).
- `config` — `{ host, model, authToken }` for creating the LLM provider.

```js
const spawnWorkerLoop = async (name, guest, config) => {
  const provider = createProvider({
    LAL_HOST: config.host,
    LAL_MODEL: config.model,
    LAL_AUTH_TOKEN: config.authToken,
  });

  const chat = messages => provider.chat(messages, tools);
  const nodeCache = new Map();
  // ... getNode, putNode, assembleTranscript (same as today) ...

  const selfId = await E(guest).identify('SELF');
  const messageIterator = makeRefIterator(E(guest).followMessages());

  while (true) {
    const { value: message, done } = await messageIterator.next();
    if (done) break;

    if (message.from === selfId) {
      handleOwnMessage(message);
      continue;
    }

    // Route to transcript chain and run agentic loop.
    // (Same logic as current agent.js runAgent.)
  }
};
```

The worker loop uses `guest` (the newly created `EndoGuest` reference) for
all power calls, not the manager's `powers`. Each worker has its own inbox,
pet store, and identity.

### Extracting the Value from a Submission

When the manager receives a `value` message replying to the configuration
form, the submitted values are carried as the message's `valueId`. The
manager needs to access the record `{ name, host, model, authToken }`.

The `value` message type (per [daemon-value-message](daemon-value-message.md))
exposes a `VALUE` edge on the message hub directory. The manager uses `adopt`
to bring the value into its pet store, then `lookup` to read it:

```js
const petName = `submission-${message.messageId}`;
await E(powers).adopt(message.number, 'VALUE', petName);
const config = await E(powers).lookup(petName);
```

Alternatively, if the `value` message carries a `resultName` hint and the
daemon auto-retains it, the manager can look it up directly. But since the
`resultName` is chosen by the sender (HOST) and may vary, `adopt` with an
explicit pet name is more reliable.

### Multiple Submissions: Adding More Agents

Because the form uses fire-and-forget semantics with `value` message replies,
HOST can submit the form any number of times. Each submission triggers a new
guest creation and worker loop. The manager maintains a `Map` of active
workers to prevent duplicate names.

To add a second agent:

```bash
# First submission
endo submit 0 -f "name:ada" -f "host:https://api.anthropic.com" \
  -f "model:claude-sonnet-4-6-20250514" -f "authToken:sk-ant-..."

# Second submission (same form, different values)
endo submit 0 -f "name:bob" -f "host:http://localhost:11434" \
  -f "model:llama3" -f "authToken:"
```

Or via Chat UI: the user opens the form from the inbox, fills it in, submits.
Opens the same form again, fills in different values, submits again.

### Idempotent Guest Creation

`provideGuest` is already idempotent — if a guest with the given name already
exists, it returns the existing guest. This means resubmitting the form with
the same name is safe: the manager gets back the existing guest and can
decide whether to restart the worker loop or skip.

The manager should persist a record of active worker configurations so it can
detect whether a resubmission changes the LLM config and warrants restarting
the worker.

### Persisting Worker State

The manager stores each worker's configuration in its pet store:

```
worker-config-<name>  →  { name, host, model, authToken }
```

On restart (daemon reboot), the manager:

1. Sends the form again (or checks if its form message already exists).
2. Lists its pet store for `worker-config-*` entries.
3. For each persisted config, looks up the guest via `E(agent).provideGuest`
   (idempotent) and respawns the worker loop.

This ensures workers survive daemon restarts without HOST needing to
resubmit the form.

## Changes to `packages/lal`

### `setup.js`

- Remove `readConfig()` and all `process.env` references.
- Remove the `env` option from `makeUnconfined`.
- Add `AGENT: 'AGENT'` to `introducedNames`.
- Remove `storeValue(config, 'lal-config')`.

### `agent.js`

- **Extract worker loop.** Move the current `runAgent` / `runAgenticLoop` /
  transcript node store / tool execution logic into a `spawnWorkerLoop`
  function (or a separate `worker.js` module) that accepts a guest reference
  and LLM config.

- **New manager loop.** Replace the top-level `runAgent` with a manager loop
  that:
  1. Sends the configuration form to HOST.
  2. Follows the manager's inbox for value replies.
  3. On each reply, creates a guest and spawns a worker.
  4. Persists worker configs for restart recovery.

- **Remove `env` dependency for provider creation.** The provider is created
  per-worker from the form submission values, not from `make()`'s `env`
  parameter.

- **Manager exo.** The returned exo object changes from `Lal` to
  `LalManager` with a `help()` method describing the form-based workflow.
  Optionally, `listWorkers()` returns the names of active worker guests.

### `agent.types.d.ts`

- Add `WorkerConfig` type:
  ```ts
  export type WorkerConfig = {
    name: string;
    host: string;
    model: string;
    authToken: string;
  };
  ```

- Remove `LalEnv` (no longer used).

- Add `LalManagerInterface` with `help()` and optionally `listWorkers()`.

### New: `worker.js` (optional)

If the worker loop is extracted to a separate module for clarity:

```
packages/lal/
├── agent.js          ← manager logic
├── worker.js         ← agentic loop (extracted from current agent.js)
├── setup.js          ← simplified
├── providers/        ← unchanged
└── ...
```

The `worker.js` module exports a `spawnWorkerLoop(name, guest, config)`
function. The manager imports and calls it. This is a code organization
choice, not an architectural change — both approaches work.

## Changes to `packages/fae`

Fae's changes mirror Lal's exactly:

### `setup.js`

- Remove `readConfig()` and `process.env` references.
- Remove the `env` option from `makeUnconfined`.
- Add `AGENT: 'AGENT'` to `introducedNames`.

### `agent.js`

- Extract the current agentic loop (with dynamic tool discovery) into a
  `spawnWorkerLoop` function.
- Add manager logic: send form, watch for value replies, create guests,
  spawn workers.
- Remove `env` dependency for provider creation.

Fae's form uses the same fields as Lal's. The only difference is the system
prompt and tool set used by the worker loops.

## Dependencies

This design depends on two features described in other design documents:

1. **[daemon-form-request](daemon-form-request.md)** — The `form()` method
   on `EndoGuest` for sending fire-and-forget forms. Currently implemented.

2. **[daemon-value-message](daemon-value-message.md)** — The `value` message
   type with `replyTo` for form submission replies. The `submit()` method on
   `EndoHost` sends a `value` message. Currently implemented.

Both are functional today via CLI (`endo form`, `endo submit`).

## User Experience

### CLI Flow

```bash
# Install Lal (no environment variables needed)
endo run --UNCONFINED packages/lal/setup.js --powers AGENT

# Check inbox — the form appears
endo inbox
# => 0. "lal" sent form "Add an agent" (fields: name, host, model, authToken) at "..."

# Submit to create an agent named "ada" using Anthropic
endo submit 0 \
  -f "name:ada" \
  -f "host:https://api.anthropic.com" \
  -f "model:claude-sonnet-4-6-20250514" \
  -f "authToken:sk-ant-..."
# => "lal" replies: Agent "ada" is now running.

# Submit again to create a local Ollama agent
endo submit 0 \
  -f "name:bob" \
  -f "host:http://localhost:11434" \
  -f "model:llama3" \
  -f "authToken:"
# => "lal" replies: Agent "bob" is now running.

# Now talk to the agents by name
endo send ada "Hello, please help me with..."
endo send bob "Can you summarize..."
```

### Chat UI Flow

1. Install Lal. The form appears in the inbox.
2. Open the form, fill in agent name and LLM credentials, submit.
3. The manager replies confirming the agent is running.
4. The new agent appears as a space in the sidebar.
5. Submit the form again for another agent.

## Design Decisions

1. **Manager/worker split.** The agent caplet acts as a manager that spawns
   independent worker loops. This keeps the manager's inbox clean (it only
   handles form submissions) and gives each worker its own identity, inbox,
   and pet store.

2. **Form for configuration.** Using the daemon's form system provides a
   structured, validated, UI-renderable configuration flow. The form can be
   resubmitted any number of times to add more agents.

3. **AGENT introduction.** The manager receives the `AGENT` power
   (host reference) via `introducedNames` so it can call `provideGuest`.
   This follows the existing setup-script pattern and keeps the consent
   boundary at the form submission — HOST chooses to submit.

4. **Per-worker provider.** Each worker creates its own LLM provider from the
   form submission's `host`/`model`/`authToken`. Different workers can use
   different models or providers.

5. **Persisted configs for restart recovery.** Worker configurations are
   stored in the manager's pet store so that on daemon restart, the manager
   can respawn workers without requiring HOST to resubmit the form.

6. **No environment variables.** The setup script passes no `env` to the
   agent caplet. All configuration flows through the form. This eliminates
   the "baked-in at provisioning" problem.

7. **Shared form fields.** Lal and Fae use identical form fields. The
   difference between them is the worker loop behavior (Lal uses reply-chain
   transcripts and static tools; Fae uses flat transcripts and dynamic tool
   discovery).

## Implementation Phases

### Phase 1: Extract Worker Loop

- Factor the agentic loop out of `agent.js` into a `spawnWorkerLoop`
  function (in Lal) and the equivalent in Fae.
- The function accepts `(name, guestRef, config)` and runs the full
  existing message-following and LLM interaction loop.
- Verify that the extracted function works identically to the current
  monolithic loop by running it with the manager's own guest reference
  and a hardcoded config. Existing tests pass.

### Phase 2: Manager Loop and Form

- Add the manager startup logic: send form to HOST, follow inbox for
  value replies.
- On each value reply to the form, extract config, create guest via
  `E(agent).provideGuest(name, ...)`, spawn worker loop.
- Update setup scripts to introduce `AGENT` and remove `env`.
- Test: install Lal, submit form via CLI, verify agent responds to messages.

### Phase 3: Restart Recovery

- Persist each worker config under `worker-config-<name>` in the manager's
  pet store.
- On startup, scan for persisted configs and respawn workers.
- Test: create agent, restart daemon, verify agent resumes without
  resubmitting the form.

### Phase 4: Fae Parity

- Apply the same manager/worker refactoring to Fae.
- Verify dynamic tool discovery works correctly when the worker loop
  uses a guest reference other than the manager's.

## Alternatives Considered

### Environment Variables with Optional Form Override

Keep the current `env`-based setup as the default, add form-based
configuration as an optional second path.

- Simpler migration; existing scripts keep working.
- Rejected because it preserves the "one agent per install" limitation
  and does not exercise the form system as the primary configuration path.

### Eval-Proposal for Guest Creation

Instead of introducing `AGENT`, the manager sends eval-proposals for each
`provideGuest` call.

- More restrictive; HOST must approve each guest creation individually.
- Adds friction for a common operation.
- Rejected in favor of the simpler `AGENT` introduction, where the form
  submission itself serves as the consent mechanism.

### Unconfined Worker Caplets

Instead of the manager spawning worker loops in-process, each form
submission triggers `makeUnconfined` to launch a separate caplet per
worker.

- Better isolation; workers crash independently.
- More complex; requires dynamically constructing caplet specifiers and
  passing config to each.
- Deferred to a future iteration. The in-process approach is simpler and
  sufficient for now.

## Related Designs

- [daemon-form-request](daemon-form-request.md) — form primitives used for
  the configuration form.
- [daemon-value-message](daemon-value-message.md) — value messages used as
  the reply mechanism for form submissions.
- [lal-reply-chain-transcripts](lal-reply-chain-transcripts.md) — the
  transcript node store used by Lal worker loops.
- [daemon-capability-persona](daemon-capability-persona.md) — the
  delegate/epithet system; each worker guest is a distinct persona.

## Files Modified

| File | Change |
|------|--------|
| `packages/lal/setup.js` | Remove env vars, add `AGENT` introduction |
| `packages/lal/agent.js` | Extract worker loop, add manager logic, send form on startup |
| `packages/lal/agent.types.d.ts` | Add `WorkerConfig`, remove `LalEnv` |
| `packages/fae/setup.js` | Remove env vars, add `AGENT` introduction |
| `packages/fae/agent.js` | Extract worker loop, add manager logic, send form on startup |
