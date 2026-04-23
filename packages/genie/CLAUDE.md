# Genie Agent Development Guide

## Identity model

Genie is the daemon's `@self`.
`@agent` and `@self` both refer to the same root worker — there is no
intermediate guest between the daemon's host agent and `main.js`.
Every message addressed to the bottle daemon's root handle reaches the
genie's `piAgent` directly.
Replies and spontaneous mail originate from the daemon's own identity,
so external peers see the bottle *as* the genie.

## Single-tenant constraint

Because the genie owns `@self`, at most one plugin per daemon may read
mail from that inbox.
Co-hosted plugins (fae, lal, jaine, etc.) are fine as long as they run
as guests under their own pet names and never claim `@self`.
If another plugin calls `follow` / `followMessages` on the host agent's
inbox while the genie is running, the two loops will race for the same
messages and neither will behave correctly.

## Boot shape

One identity, one worker, three steps:

1. `bottle.sh invoke` starts a daemon and networks.
2. `endo run --UNCONFINED setup.js --powers @agent` runs `setup.js`
   with the host agent as `powers`.
3. `setup.js` calls
   `E(hostAgent).makeUnconfined('@main', main.js, { powersName:
   '@agent', resultName: 'main-genie', env: … })`,
   which materialises `main.js` as an unconfined worklet whose
   `powers` argument *is* the daemon's root host agent.

`setup.js` is idempotent: it checks
`E(hostAgent).has('main-genie')` and short-circuits when the worker
already exists.
A daemon restart reincarnates `main-genie` from its persisted formula
without re-running `setup.js`.

## Env-var config

`main.js` reads configuration from the `env` object that
`makeUnconfined` forwards as the third argument to `make(powers,
context, { env })`.
`setup.js` is the sole authorised forwarder: it copies selected
`GENIE_*` variables from the launcher's `process.env` into that `env`
object.

- `GENIE_MODEL` — **required**; LLM model spec (e.g. `ollama/llama3.2`).
- `GENIE_WORKSPACE` — **required**; absolute path to the persistent
  workspace directory (`MEMORY.md`, `HEARTBEAT.md`, `.genie/`).
- `GENIE_NAME` — optional; stable pet name, defaults to `main-genie`.
- `GENIE_AGENT_DIRECTORY` — optional; child-agent directory name,
  defaults to `genie`.
- `GENIE_HEARTBEAT_PERIOD` / `GENIE_HEARTBEAT_TIMEOUT` — optional
  heartbeat tuning.
- `GENIE_OBSERVER_MODEL` / `GENIE_REFLECTOR_MODEL` — optional model
  overrides for the observer and reflector sub-agents; default to the
  main chat model.

`main.js` is the authoritative source — see the env-parsing block near
the bottom of `make()` for the current list and defaults, and the
`setup.js` forwarding table for which variables propagate across the
`makeUnconfined` boundary.

## Sub-agent spawning (deferred)

`spawnAgent`, `removeChildAgent`, and `listChildAgents` are defined in
`main.js` but are **not** invoked on boot.
They are retained as building blocks for a future capability the root
genie can expose (see `TODO/10_genie_self.md` Clarification 2 for the
planned shape).
Until that work lands, treat them as internal scaffolding — do not add
new callers without a companion design note.

## Conventions

- Follow the top-level `CLAUDE.md` § "Hardened JavaScript (SES)
  Conventions" — `// @ts-check`, JSDoc types, and `harden()` after every
  named export.
- Prefer `makeExo` + `M.interface()` over `Far()` for any remotable
  surface the root genie exposes; `makeExo` gives CapTP introspection
  `__getMethodNames__()` for free.
- Use `E(ref)` for all message sends; never invoke remote methods
  directly.
