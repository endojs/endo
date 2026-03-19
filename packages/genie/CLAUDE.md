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

### Sandbox slice (Phase 3.5a)

Before launching the worker, `setup.js` also pins two capabilities in
the host pet store that `main.js` consumes from `powers` on boot
(see `packages/sandbox/` and
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
for the full design):

- **`workspace-mount`** — a `Mount` capability rooted at
  `GENIE_WORKSPACE`, provisioned via `provideMount` and reused on
  re-runs.
  This is the host-side handle the slice binds at `/workspace`.
- **`sandbox-factory`** — the `@endo/sandbox` plugin loaded via
  `makeUnconfined('@agent', sandboxAgentSpecifier, { powersName:
  '@agent', resultName: 'sandbox-factory' })`.
  Resolves to a `SandboxFactory` exo whose `makePersistent(name,
  spec)` mints (and on subsequent boots, re-mints from the recorded
  spec) a `SandboxHandle` pinned by pet name.

`main.js` then calls `E(factory).makePersistent('main-genie-sandbox',
{ rootfs: { kind: 'host-bind' }, mounts: [{ cap: workspaceMount,
innerPath: '/workspace', mode: 'rw' }], env: { GENIE_WORKSPACE:
'/workspace' }, cwd: '/workspace', network: 'private', backend:
'auto' })` and threads the resulting `SandboxHandle` into the tool
registry so `bash` / `exec` / `git` spawn through
`E(slice).spawn(...)` instead of host `child_process.spawn`.

If either capability is absent (e.g. an older `setup.js`, or the
sandbox plugin failed to register because no backend is installed),
`main.js` logs a clearly-marked diagnostic and proceeds with the
host-spawn fallback path in `tools/command.js`.
The agent surface is unchanged either way — the slice swap is purely
internal.

#### Host vs slice `GENIE_WORKSPACE`

`GENIE_WORKSPACE` has two coexisting views after 3.5a:

- **Outside the slice** (the launcher and the host-side worker): the
  operator-supplied absolute host path (e.g.
  `/home/op/.local/share/endo/genie/workspace`).
  This view is what `initWorkspace`, `loadPersistedConfig` /
  `savePersistedConfig`, `makeFTS5Backend`, `makeFileTools`, and
  `makeMemoryTools` see when they read MEMORY.md, HEARTBEAT.md, or
  `.genie/` on disk.
  These call sites consume the captured `workspaceDir` local sourced
  from `make()`'s `env` argument, not `process.env`.
- **Inside the slice** (every tool spawn): `/workspace`.
  The bwrap / podman driver renders `--setenv GENIE_WORKSPACE
  /workspace` and `--chdir /workspace` from the `env` and `cwd` baked
  into the slice spec, and any tool the agent runs with `bash` /
  `exec` / `git` sees that view.

After the slice mint resolves, `main.js` rewrites
`process.env.GENIE_WORKSPACE` to `/workspace` — defence-in-depth for a
future tool or third-party module that reads `process.env` while
running in-process inside the worker.
The missing-slice fallback path intentionally **does not** rewrite,
so `command.js`'s host-spawn branch keeps matching the workspace
files on disk.
See
[`TADA/36_endo_genie_sandbox_workspace_path.md`](../../TADA/36_endo_genie_sandbox_workspace_path.md)
for the full audit and the in-source `// ── In-process
GENIE_WORKSPACE rewrite ──` comment in `runRootAgent`'s mint block
for the call-site catalogue.

## Env-var config

`main.js` reads configuration from the `env` object that
`makeUnconfined` forwards as the third argument to `make(powers,
context, { env })`.
`setup.js` is the sole authorised forwarder: it copies selected
`GENIE_*` variables from the launcher's `process.env` into that `env`
object.

- `GENIE_MODEL` — required unless a persisted model config exists or
  the operator plans to use `/model`; LLM model spec
  (e.g. `ollama/llama3.2`).
  When neither this var nor a persisted config is present, `main.js`
  boots in **primordial mode** — the inbox loop runs and every plain-text
  message receives a friendly pointer at `/help` and `/model list`
  (see `src/primordial/index.js`'s `makePrimordialAutomaton`) until
  `/model commit` hands off to piAgent.
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

### Persisted model config

`/model commit` writes the active model configuration to
`<GENIE_WORKSPACE>/.genie/config.json` (schema v1; see
`src/primordial/types.js` for the typedef and
`src/primordial/persistence.js` for the read / write helpers).
The file is written atomically (temp file + rename) and chmod'd to
`0600` on POSIX so co-tenants on the same machine cannot read the
credentials.

The boot-time precedence rule lives in `make()` and is, in order:

1. **Env-var.** `GENIE_MODEL` — wins outright; the persisted file is
   not consulted.
2. **Persisted.** `<GENIE_WORKSPACE>/.genie/config.json` — when no
   `GENIE_MODEL` is set, the loader reads `provider` / `modelId` /
   `credentials` / `options` from disk.
   Credentials and options are stamped into `process.env` before the
   agent pack is constructed so pi-ai's request-time `getEnvApiKey`
   lookups find the operator's configured values.
   Existing env values win over persisted ones, so a launcher-supplied
   override is never silently clobbered.
3. **Primordial.** No env, no persisted config — `main.js` boots into
   primordial mode and the operator can use `/model` to install a
   provider.

The plaintext file **must not** be checked into source control.
The first line of the file is a `_README` pointer back to this
document so an operator browsing the workspace by hand sees the
warning.
A capability- / keychain-backed credential store is tracked as a
follow-up under `TADA/92_genie_primordial.md` § 3g — the env-stamping
hack is documented there too.

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
