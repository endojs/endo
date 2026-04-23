# Phase 2: primordial genie + `/model` builtin

Implements Phase 2 of `PLAN/genie_in_bottle.md` §
"Credentialing and the primordial genie".
Depends on Phase 1 (`TADA/10_genie_self.md` and sub-tasks 11–14,
all landed) — the genie already runs as the daemon's `@self`, reads
config from `context.env`, and exposes a specials dispatcher.

## Goal

Let the bottle boot *before* it has model credentials, accept
credentials from the operator over the invite edge after handshake,
and transition to the piAgent loop once configured.
Persist the model + credentials next to the workspace so a daemon
restart re-enters the piAgent loop without re-prompting.

## 1. Research

Verified against the tree at 2026-04-23.

### 1a. Current credential surface

- `packages/genie/main.js:1213-1229` — `make(powers, _context, { env })`
  reads `env.GENIE_MODEL` / `env.GENIE_WORKSPACE` and throws
  synchronously when either is missing.
  Phase 2 must relax the `GENIE_MODEL` branch (start in primordial
  mode when no env value and no persisted credentials exist);
  `GENIE_WORKSPACE` stays mandatory because the workspace is where
  primordial state lives.
- `packages/genie/main.js:1108-1211` — `runRootAgent(rootPowers,
  config)` is the sole boot path.  It calls `makeGenieAgents(...)` at
  line 1143, `runAgentLoop({...})` at line 1166, and starts the
  heartbeat ticker at 1193 — all of which assume the model exists.
  Phase 2 splits this into a "always-runs" prelude (workspace init,
  cancellation kit, IO adapter, specials dispatcher) and a
  piAgent-only postlude (agent pack + heartbeat ticker), with a
  primordial branch in between.
- `packages/genie/main.js:163-277` — `processMessage` always hands off
  to `runAgentRound(piAgent, prompt)`.  Primordial mode short-circuits
  this dispatch with a non-LLM handler reached from a new prompt
  `kind: 'primordial'`.
- `packages/genie/main.js:636-648` — specials dispatcher mount point
  (`observe`, `reflect`, `help`, `tools`).  `/model` plugs in here,
  wired up in *both* primordial and piAgent modes.
- `packages/genie/main.js:469` — `.genie/<agent>/intervals/` is the
  workspace-adjacent scheduler-state precedent for "configuration
  written next to the workspace".  The Phase 2 config goes alongside
  it under `.genie/`.
- `packages/genie/main.js:554` — JSDoc still reads "not setup-genie",
  a stale reference to the pre-refactor guest name.  Clean up in the
  first sub-task that touches `main.js`.
- `packages/genie/CLAUDE.md` § "Env-var config" — describes
  `GENIE_MODEL` as **required**.  Update to "required unless a
  persisted model config exists or the operator plans to use
  `/model`" alongside the fail-fast relaxation.

### 1b. Model abstraction / provider plumbing

- **Parsing site.** `packages/genie/src/agent/index.js:42-65`
  `resolveModel(modelString)` splits on the first `/`: the prefix
  becomes the provider, the remainder becomes the model id.  Bare
  strings (no `/`) default to provider `'ollama'`
  (`DEFAULT_PROVIDER` at line 251) with the bare string as the model
  id.  `DEFAULT_MODEL_STRING = 'ollama/llama3.2'` (line 255).
- **Provider dispatch.** Same file lines 54-64: `'ollama'` is handled
  inline by `buildOllamaModel` (lines 95-127), which masquerades as
  the OpenAI-completions provider with a `baseUrl` derived from
  `OLLAMA_HOST` (default `http://127.0.0.1:11434`) and an API key
  from `OLLAMA_API_KEY` (default `'ollama'`).  All other providers
  go through pi-ai's `getModel(provider, modelId)`.
- **Known providers.** `packages/genie/main.js:41` /
  `node_modules/@mariozechner/pi-ai/dist/providers/register-builtins.js:204-255`
  registers anthropic, openai-completions, mistral, openai-responses,
  azure-openai-responses, openai-codex-responses,
  google-generative-ai, google-gemini-cli, google-vertex, and
  bedrock-converse-stream APIs at module load.  `getProviders()`
  (`pi-ai/dist/models.js:15`) returns the dynamic list at runtime —
  the list is duck-typed, not statically declared in genie code.
- **Credential matrix.** From `pi-ai/dist/env-api-keys.js:47-105`,
  each provider expects a specific env var (`OPENAI_API_KEY`,
  `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`,
  `XAI_API_KEY`, `OPENROUTER_API_KEY`, …); `google-vertex` and
  `amazon-bedrock` accept multi-credential authenticated states
  (ADC, AWS profile, etc.); `ollama` is local-only and needs only an
  optional `OLLAMA_HOST` URL.  The `/model` builtin must be aware
  enough of this matrix to ask for the right keys per provider —
  hard-code a `PROVIDER_CREDENTIAL_SPEC` table in the genie package
  rather than try to introspect pi-ai (the env-key map there is not
  publicly exported).
- **Listing affordance.** No "list available models" capability
  exists today.  Operators have to know the provider's model id out
  of band; `/model list` must seed a reasonable default catalog
  (e.g. ship a JSON of known-good `provider/model` pairs) and accept
  arbitrary ids as a fallback.
- **Swap-at-runtime.** Not supported.  `makeGenieAgents`
  (`packages/genie/src/loop/agents.js:97-167`) constructs every
  sub-agent (`piAgent`, `heartbeatAgent`, `observer`, `reflector`)
  in one shot with the model strings hard-coded into the closures.
  A model swap requires a full agent-pack rebuild.  The piAgent
  itself has no "rebind model" method — see
  `node_modules/@mariozechner/pi-agent-core` (the constructor takes
  the model and stores it in private state).
  Implication for `/model` in piAgent mode: the swap path is "tear
  down the loop, rebuild the pack, restart".  Easier to implement as
  "schedule restart + persist new config + exit" and let the daemon
  reincarnate the worker, than to thread a tear-down through
  `runGenieLoop`.

### 1c. Persistence location

Decisions for this phase:

- **File path.** `<GENIE_WORKSPACE>/.genie/config.json`.
  Matches the `.genie/<agent>/intervals/` precedent
  (`packages/genie/main.js:469`) — `.genie/` is the
  genie-internal-state directory.  The workspace template seeded by
  `packages/genie/src/workspace/init.js` does not touch `.genie/`,
  so there is no template-vs-config collision.
- **Schema.** JSON object, single top-level version field plus a
  `model` sub-object:

  ```json
  {
    "version": 1,
    "model": {
      "provider": "anthropic",
      "modelId": "claude-sonnet-4-5",
      "credentials": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      },
      "options": {
        "OLLAMA_HOST": "http://127.0.0.1:11434"
      }
    }
  }
  ```

  `credentials` and `options` are split so future hardening
  (keychain) can move `credentials` out without disturbing
  user-visible options.  Atomic write via temp-file + rename.
- **Credential hygiene.** Plaintext-in-workspace is the *known-weak*
  default for this phase.  Document the risk loudly in
  `packages/genie/CLAUDE.md`, in the on-disk config (a
  `_README` field at the top of the JSON pointing to the docs), and
  in the `/model commit` reply.  File mode is `0600`.  A future
  phase moves credentials behind a capability (keychain / DPAPI /
  libsecret / Endo store-with-secret).  Tracked as out-of-scope risk
  in § 3g.
- **Precedence.** Env wins over persisted config (so an operator can
  always force a specific model via `bottle.sh invoke -E
  GENIE_MODEL=…`); persisted wins over primordial.  Chosen because
  it matches Clarification 2 and preserves backwards compatibility.

### 1d. Existing pre-LLM parsers to model after

- **Heartbeat short-circuit.** `packages/genie/main.js:712-723`
  classifies `/heartbeat` self-sends as `kind: 'heartbeat'` in the
  IO adapter; `packages/genie/src/loop/run.js:155-212` (`runGenieLoop`)
  branches on `kind` at line 175 and routes to `handlers.runHeartbeat`
  at line 177.  This is the exact template — add `kind: 'primordial'`
  to `InboundPromptKind` (`packages/genie/src/loop/io.js:37`) and a
  `handlers.runPrimordial` branch in `runGenieLoop`.  The runner is
  agnostic about agent existence: nothing in `runGenieLoop`
  dereferences `piAgent`, so booting *without* one is structurally
  fine.
- **Specials dispatcher.** `packages/genie/src/loop/specials.js:78-126`
  (`makeSpecialsDispatcher`) and
  `packages/genie/src/loop/builtin-specials.js:104-238`
  (`makeBuiltinSpecials`) — handler signature is `async function*(tail:
  string[]): AsyncGenerator<Chunk>`.  Copy the `help` handler
  (`builtin-specials.js:198-207`) for `/model help` and the `observe`
  handler (`builtin-specials.js:140-167`) for the
  precondition-then-yield-status pattern.
- **Intent matching.** Literal subcommands (`/model list`, `/model set
  anthropic claude-sonnet-4-5`, …).  Soft natural-language matching
  is impossible without an LLM; commit to literal parsing and ship a
  prominent `/help` / `/model help` string.
- **Smoke test affordance.** `/model test` runs one round-trip
  through pi-agent-core with a fixed prompt ("Say `pong`.") on a
  scratch piAgent built from the staged config, surfaces the
  response back to the operator, and tears the scratch agent down.
  This is more reliable than asking pi-ai for a "ping" capability
  that does not exist.

## 2. Clarifications

Confirmed against the design above; no amendments.

1. **`/model` is the only credential path.**
   Phase 2 does not add env-var forwarding for API keys.  If a future
   operator wants turn-up-time credentialing, they pass `GENIE_MODEL`
   as today — the primordial path is purely additive.
2. **Primordial mode is a boot-time decision.**
   If `GENIE_MODEL` is set in env or a persisted config is found, the
   genie boots straight into piAgent mode.  Otherwise it boots
   primordial and waits.  No dynamic "switch back to primordial" once
   the piAgent is running.
3. **Single-tenant assumption holds.**
   Credentials live at the root genie's level; there is no
   "primordial mode for sub-agents".  Sub-agent spawning is still
   deferred (Phase 1 Clarification 2).
4. **Workspace is trusted storage.**
   For this phase, credentials are plaintext in the workspace.
   Hardening (keychain, DPAPI, libsecret, etc.) is a later phase and
   should not block the bring-up path.  Document the risk clearly.
5. **The `/model` UI is command-style, not form-style.**
   Unlike the old `setup.js` form flow this replaces, `/model` is a
   plain slash command with subcommands.  No form plumbing.
6. **`/model` in piAgent mode does not hot-swap.**
   New in this revision: because `makeGenieAgents` builds the whole
   agent pack at construction time, swapping providers requires a
   worker restart.  `/model commit` in piAgent mode persists the new
   config and exits the worker; the daemon reincarnates the worker
   on the next message and the new config takes effect.
   See § 3e for the state-machine details.

## 3. Design plan

### 3a. Boot mode selection

- Extend `make()` in `packages/genie/main.js` so the env-validation
  block (lines 1213-1229) becomes a three-way resolution:
  1. `env.GENIE_MODEL` → `mode = 'piAgent'`, model from env.
  2. else load `<workspace>/.genie/config.json` → `mode = 'piAgent'`,
     model from persisted config (this is the restart path).
  3. else `mode = 'primordial'`, no model in `rootConfig`.
  `env.GENIE_WORKSPACE` stays required in all three branches because
  the workspace is also where the persisted config lives.
- Pass a `mode: 'piAgent' | 'primordial'` field through the
  `AgentConfig` typedef (lines 134-148) and into `runRootAgent`.
  Both modes share workspace init, the cancellation kit, the IO
  adapter construction, and the specials dispatcher; only the
  agent-pack construction (`makeGenieAgents`) and the heartbeat
  ticker startup are gated on `mode === 'piAgent'`.

### 3b. The primordial automaton

- New module: `packages/genie/src/primordial/index.js`.
  Exports `makePrimordialAutomaton({ workspaceDir, persistConfig,
  buildScratchAgent, requestPiAgentTransition })`.  Owns the
  in-memory draft state (selected provider, model id, credentials)
  and exposes `processPrompt(text): AsyncGenerator<string>` returning
  reply chunks.
- Wire-up: in the IO adapter (`packages/genie/main.js:687-725`,
  `daemonPrompts`), classify *all* non-heartbeat prompts as
  `kind: 'primordial'` when `mode === 'primordial'`.  Specials still
  flow through the dispatcher (so `/help`, `/tools`, `/model` work
  in primordial mode); plain-text prompts are intercepted by the
  primordial handler with a friendly "I'm not configured yet — try
  `/help` or `/model list`" reply.
- `runGenieLoop` gets a `kind: 'primordial'` branch
  (`packages/genie/src/loop/run.js:174-185`) that calls
  `handlers.runPrimordial(prompt)` analogous to the heartbeat branch.
- Supported `/model` subcommands (minimum viable set) — see § 3c.

### 3c. `/model` builtin registration

- Add `model` to the `makeBuiltinSpecials` factory
  (`packages/genie/src/loop/builtin-specials.js:104-238`).  Signature
  matches the existing handlers — `async function*(tail) yields
  io.{info,notice,warn,error,success}(...)`.
  Ship a hard-coded `PROVIDER_CREDENTIAL_SPEC` table in
  `packages/genie/src/primordial/providers.js` describing each
  provider's required credential keys + optional URL/host options;
  `/model list` reads from the same table.
- Subcommands:
  - `/model list` — print the known provider catalog and a
    one-liner per provider (`anthropic`: needs `ANTHROPIC_API_KEY`;
    `ollama`: local, optional `OLLAMA_HOST`; …).  Includes a
    "currently configured" indicator when piAgent mode is live.
  - `/model show` — print the current `provider/modelId` and the
    masked credential keys (`ANTHROPIC_API_KEY=sk-ant-…<redacted>`).
  - `/model set <provider> <modelId> [KEY=value …]` — stage a draft.
    Validates `provider` against `getProviders()` (plus the
    inline-handled `'ollama'`); validates that all required
    credential keys for that provider are present; rejects unknown
    `KEY=value` keys with a pointer to `/model list`.
  - `/model test` — build a scratch piAgent from the draft, run a
    fixed-prompt round-trip ("Say `pong`."), and report
    success/failure with a structured error code (`AUTH`,
    `NETWORK`, `PROVIDER_ERROR`, `OTHER`) so the operator gets a
    useful message.  Tear the scratch agent down on completion.
  - `/model commit` — atomically persist the draft to
    `.genie/config.json`; in primordial mode, transition to piAgent
    (§ 3e); in piAgent mode, log + send a "restart required" reply
    and trigger worker exit so the daemon reincarnates with the new
    config.
  - `/model clear` — drop the in-memory draft (no effect on persisted
    config).
  - `/model help` — print the full subcommand list with examples.
- Mount `/model` in *both* primordial and piAgent modes.  The
  per-mode behaviour difference is contained in the subcommand
  bodies, not the registration site.
- `/help` (the existing handler at
  `packages/genie/src/loop/builtin-specials.js:198-207`) gains a
  `/model` line via the `listHelpLines` IO method
  (`packages/genie/main.js:619-625`).

### 3d. Persistence

- New module: `packages/genie/src/primordial/persistence.js`.
  - `loadConfig(workspaceDir)` → `Promise<Config | undefined>`;
    treats absent file or JSON parse error as `undefined` and logs a
    warning.  Returns the parsed object after schema validation
    (version field check).
  - `saveConfig(workspaceDir, config)` → `Promise<void>`; writes to
    `.genie/config.json.tmp` with mode `0600`, then `rename` to
    `.genie/config.json`.  The temp suffix means a crashed write
    does not corrupt the existing config.
  - `clearConfig(workspaceDir)` → `Promise<void>`; unlink with EEXIST
    tolerance (used by a future `/model clear --persisted`).
- Boot-time precedence (see § 3a): env > persisted > primordial.
  Document this clearly in the JSDoc on `make()` and in
  `packages/genie/CLAUDE.md` § "Env-var config".

### 3e. Transition to piAgent

State machine:

| Current mode | `/model commit` outcome                                   |
|--------------|-----------------------------------------------------------|
| primordial   | persist → build agent pack → flip mode → start heartbeat → emit "ready" reply. |
| piAgent      | persist → reply "restart required" → exit worker (daemon reincarnates with new config). |

Primordial → piAgent transition steps (in `main.js`, in a new
`activatePiAgent({ rootPowers, workspaceDir, config, ... })` helper
shared with the cold-boot path):

1. Persist the config (already done by `/model commit`'s caller, but
   the helper checks idempotency — passing the freshly-staged
   config in directly avoids a re-read).
2. Construct the agent pack via `makeGenieAgents` (matching
   `packages/genie/main.js:1143-1153`).
3. Build observer / reflector logging banner
   (`packages/genie/main.js:1155-1161`).
4. Atomically flip the mode flag observed by `daemonPrompts` so
   subsequent prompts route to the piAgent branch.
   The simplest implementation is a mutable `state` object closed
   over by both the IO adapter and the `runPrimordial` handler.
5. Start the heartbeat ticker (matching
   `packages/genie/main.js:1186-1202`).
6. Emit a "ready" reply to the prompt that triggered the commit so
   the operator sees the hand-off succeed.
7. Log a single visible line: `[genie:<name>] Transitioned to
   piAgent mode (model: <provider/modelId>)`.

The transition is *not* re-entrant — guard with a one-shot promise so
two simultaneous `/model commit` calls cannot race the agent-pack
construction.

### 3f. Heartbeat + observer + reflector in primordial mode

- The heartbeat ticker (`runHeartbeatTicker`,
  `packages/genie/main.js:454-547`) requires `piAgent` /
  `heartbeatAgent` references and is the most expensive thing to
  defer.  Skip the call entirely in primordial mode; start it during
  the § 3e activation step.
- Observer / reflector live inside the agent pack returned by
  `makeGenieAgents`; gating the pack construction also gates these.
- Add inline JSDoc comments at the activation site explaining the
  "do not start before piAgent" gating so a future contributor does
  not refactor them earlier.

### 3g. Risks / things to watch

- **Credential hygiene.** `0600` plaintext-in-workspace is the
  documented weak default.  Track a follow-up TODO for a
  capability/keychain-backed secret store; do not block this phase
  on it.
- **Provider failures during `/model test`.** Distinguish wrong
  credentials (HTTP 401/403, anthropic auth error JSON, openai
  `invalid_api_key`) from unreachable provider (DNS / ECONNREFUSED /
  TLS error) so the operator gets a useful error.  Concretely: catch
  the thrown error, look at `error.code` / `error.status` /
  `error.message`, and map onto the four-bucket error code defined
  in § 3c.
- **Partial state on crash.** If the daemon crashes between
  `/model set` and `/model commit`, the persisted file is unchanged
  (the draft lives only in memory); the operator must restart the
  staging.  Acceptable for v1 — document it.
  If the crash happens mid-write of `.genie/config.json`, the
  atomic rename means the previous version (or absence) wins.
- **Backwards compatibility.** Existing
  `bottle.sh invoke -E GENIE_MODEL=…` invocations stay working: env
  precedence is the default, the persisted config is the fallback,
  and primordial mode only kicks in when both are absent.
- **Live-swap surprises.** `/model commit` in piAgent mode persists
  + exits, leaning on the daemon to reincarnate.  Document this
  behaviour visibly in the reply so the operator does not interpret
  the worker exit as a crash.
- **Race between primordial `processPrompt` and `/model commit`
  hand-off.** A second prompt arriving during § 3e's hand-off must
  see the post-flip state.  Guard with the one-shot promise from
  § 3e and the mutable `state` object.

## 4. Follow-up tasks

These are the concrete sub-tasks; each must leave the tree in a
working state.  Created alongside this revision.

- [`TODO/93_genie_primordial_boot.md`](./93_genie_primordial_boot.md) —
  boot-mode selection, relax the env fail-fast, plumb `mode` and
  `state` through `runRootAgent`; clean up the stale "not setup-genie"
  comment.
- [`TODO/94_genie_primordial_automaton.md`](./94_genie_primordial_automaton.md) —
  `runPrimordialRound` parser/responder; literal command recognition;
  add `kind: 'primordial'` to `InboundPromptKind`.
- [`TODO/95_genie_model_builtin.md`](./95_genie_model_builtin.md) —
  `/model` subcommand family registered in the specials dispatcher;
  works in both primordial and piAgent modes; provider catalog table.
- [`TODO/96_genie_model_persistence.md`](./96_genie_model_persistence.md) —
  config file schema + atomic read/write + `0600` perms +
  boot-time precedence resolution.
- [`TODO/97_genie_primordial_transition.md`](./97_genie_primordial_transition.md) —
  hand-off from primordial to piAgent (`activatePiAgent` helper);
  observer/reflector/heartbeat re-enable; piAgent-mode commit triggers
  worker exit for daemon reincarnation.
- [`TODO/98_genie_primordial_tests.md`](./98_genie_primordial_tests.md) —
  unit tests for the automaton + persistence; integration test for
  the full primordial → `/model commit` → piAgent path
  (extend the `self-boot.test.js` harness).

## 5. Status

- [x] fill § 1 Research with verified file/line references and the
      answers to the open questions
- [x] confirm or amend § 2 Clarifications against operator
      expectations (added Clarification 6 to make the
      "no live swap, restart instead" decision explicit)
- [x] flesh out § 3 Design plan, especially § 3c (`/model`
      subcommand shape) and § 3d (persistence schema)
- [x] create § 4 follow-up task files in `TODO/` (numbered
      contiguously with this file; do not wait for feedback)
- [ ] mark Phase 2 as landed in `PLAN/genie_in_bottle.md` once all
      follow-ups are done

## Notes

- The top of `PLAN/genie_in_bottle.md` already identifies Phase 2 as
  "the next unattempted phase"; keep that banner in sync as this
  work lands.
- `packages/genie/CLAUDE.md` § "Env-var config" says `GENIE_MODEL` is
  **required**.  Update that to "required unless a persisted model
  config exists or the operator plans to use `/model`" at the same
  time as the fail-fast relaxation (sub-task 93).
- One stale textual residue spotted during the Phase 1 review:
  `packages/genie/main.js:554` contains a JSDoc comment that still
  reads "not setup-genie" — a leftover reference to the pre-refactor
  guest name.  Clean it up as part of sub-task 93 (the first sub-task
  that touches `main.js`).
