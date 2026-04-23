# Phase 2 sub-task: `/model` builtin

**Status:** Landed (2026-04-28).
All 104 tests in `npx ava packages/genie/test/primordial/
packages/genie/test/loop/ packages/genie/test/boot/self-boot.test.js
--timeout=120s` pass; `/model` is mounted in both primordial and
piAgent modes via `makeBuiltinSpecials` and the `main.js` dispatcher.
`/model commit` falls back to the labelled stub when sub-task 96's
`persistence.saveConfig` is not wired, and emits the "restart
required" / "restart trigger lands in sub-task 97" hints documented
below.

Implements § 3c of [`TODO/92_genie_primordial.md`](./92_genie_primordial.md).
Depends on sub-task 94 (the primordial dispatch path).
Lands in parallel with sub-task 96 (persistence) — `/model commit`
needs `saveConfig` from 96; if 96 has not landed, gate the commit
behaviour behind a stub that logs "(commit will land with sub-task
97 + 96)".

## Goal

Add the `/model` slash command family — `list`, `show`, `set`,
`test`, `commit`, `clear`, `help` — to the shared
`makeBuiltinSpecials` map, mounted in both primordial and piAgent
modes by `packages/genie/main.js`.  Operators can stage a model
selection, smoke-test it, and (in primordial mode) commit it; in
piAgent mode `commit` triggers a persisted-then-restart flow
(actual restart trigger lands in sub-task 97).

## Files

- `packages/genie/src/loop/builtin-specials.js:104-238` — extend
  `makeBuiltinSpecials` to also return `model`.  The handler
  delegates to a new `makeModelHandler({ workspaceDir, state, io,
  providerSpec, persistence })` factory (split out for testability;
  the heartbeat handler is the precedent for keeping handler
  bodies in the same file when small, but `/model` is large enough
  to deserve its own file).
- `packages/genie/src/primordial/model-handler.js` — *new* module
  housing the subcommand bodies + the staging-state owner.
- `packages/genie/src/primordial/providers.js` — *new* module with
  the hard-coded `PROVIDER_CREDENTIAL_SPEC` table.  Keys: provider
  name; values: `{ api: 'anthropic-messages' | …, requiredCreds:
  string[], optionalOptions: string[], notes: string }`.  Seed with:
  - `ollama` — local; optional `OLLAMA_HOST`, `OLLAMA_API_KEY`.
  - `anthropic` — `ANTHROPIC_API_KEY` (or `ANTHROPIC_OAUTH_TOKEN`).
  - `openai` — `OPENAI_API_KEY`.
  - `google` — `GEMINI_API_KEY`.
  - `groq`, `xai`, `openrouter`, `mistral`, `cerebras` — single
    `*_API_KEY` each.
  See `packages/genie/node_modules/@mariozechner/pi-ai/dist/env-api-keys.js:47-105`
  for the authoritative pi-ai-side env-key map.
- `packages/genie/src/primordial/scratch-agent.js` — *new* module
  with `buildScratchPiAgent({ provider, modelId, credentials,
  options })`.  Returns a one-shot `runPing()` that issues a fixed
  prompt ("Say `pong`.") and resolves with the first assistant
  message or rejects with a structured error.  Used by `/model
  test`.
- `packages/genie/main.js:619-625` — extend `listHelpLines` to
  include `/model`.
- `packages/genie/main.js:636-648` — register the new `model`
  handler in the dispatcher's `handlers` map.

## `/model` subcommand surface

| Command | Behaviour |
|---|---|
| `/model list` | Print provider catalog from `providers.js`; mark currently configured one with `[active]`. |
| `/model show` | Print active provider/modelId; mask credential values (`sk-ant-…<redacted>`). |
| `/model set <provider> <modelId> [KEY=value …]` | Stage a draft.  Validate provider name + required creds; reject unknown keys. |
| `/model test` | Build scratch piAgent from draft; round-trip a fixed prompt; report `OK` or `(AUTH\|NETWORK\|PROVIDER_ERROR\|OTHER): <message>`. |
| `/model commit` | Persist (calls into sub-task 96).  Primordial: trigger hand-off (sub-task 97).  PiAgent: reply "restart required" + signal worker exit. |
| `/model clear` | Drop the in-memory draft. |
| `/model help` | Print this table as plain text. |

## Implementation notes

- The staging state is shared with the primordial automaton (sub-task
  94) via the `state` object: `state.draft = { provider, modelId,
  credentials, options }` is set by `/model set` and read by
  `/model test` / `/model commit`.
- `/model commit` in piAgent mode does not hot-swap; see parent
  task § 2 Clarification 6.  This sub-task can land the persist +
  log-and-reply path; the actual worker-exit trigger is sub-task
  97's responsibility.  Use a stub that throws a labelled error
  ("(restart trigger lands in sub-task 97)") if 97 is not yet
  landed.
- Credential masking: keep the first 6 + last 2 characters,
  replace the middle with `…<redacted>`.  Specifically *do not* log
  full credentials anywhere — even in the worker log on success.
- `/model test` error classification:
  - `AUTH`: HTTP 401/403, bodies containing `invalid_api_key` /
    `authentication`, anthropic `auth_error` / `invalid_request_error`
    when message includes "API key".
  - `NETWORK`: `ECONNREFUSED`, `ENOTFOUND`, TLS errors, anything
    surfacing `code: 'ECONN…'` from undici / fetch.
  - `PROVIDER_ERROR`: any other 4xx/5xx with a JSON body.
  - `OTHER`: catch-all, includes the raw error message.

## Tests

- `packages/genie/test/primordial/providers.test.js`: every entry
  in `PROVIDER_CREDENTIAL_SPEC` references an env-key recognised by
  `getEnvApiKey` from `pi-ai/dist/env-api-keys.js`, or is the
  inline-handled `ollama` case.
- `packages/genie/test/primordial/model-handler.test.js` (unit):
  drive each subcommand through a fake `state` + fake `persistence`;
  assert reply chunks and state transitions.
- Extend `packages/genie/test/loop/builtin-specials.test.js` to
  cover the new `model` entry in the handler map.
- Extend `packages/genie/test/boot/self-boot.test.js`: send
  `/model list` to a primordial worker; assert reply mentions
  `ollama` and `anthropic`.

## Acceptance

- `npx ava packages/genie/test/primordial/ packages/genie/test/loop/
  packages/genie/test/boot/self-boot.test.js --timeout=120s` passes.
- A primordial worker can answer `/model list`, `/model set ollama
  llama3.2`, `/model show`, and (with a real local Ollama) `/model
  test`.
- `/model commit` does *not* yet rebuild the agent pack — that is
  sub-task 97; the reply explains so.

## Non-goals

- The actual primordial → piAgent transition (sub-task 97).
- The worker-exit trigger for piAgent-mode commits (sub-task 97).
- Persistence atomicity (sub-task 96).
