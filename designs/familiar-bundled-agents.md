# Familiar Bundled Agents

| | |
|---|---|
| **Created** | 2026-03-02 |
| **Updated** | 2026-03-05 |
| **Author** | Kris Kowal (prompted) |
| **Status** | **Complete** |

## What is the Problem Being Solved?

The Familiar (Electron shell) ships with a bundled Endo daemon but no AI agent
caplets. Users who want Lal or Fae must install them from the monorepo source
tree using `endo run --UNCONFINED setup.js --powers AGENT`. This has three
problems:

1. **Requires the source tree.** The Familiar is a self-contained Electron app.
   End users who install it from a `.dmg` or `.zip` do not have the monorepo
   checkout, so they cannot run setup scripts.

2. **Requires `node_modules`.** The agent caplets use `import()` with bare
   specifiers (`@anthropic-ai/sdk`, `openai`, `ollama`). Node.js resolves
   these via `node_modules` lookup from the agent file's directory. In the
   packaged Familiar, there is no `node_modules` tree for agent code.

3. **No integrated first-run experience.** A user launches the Familiar for the
   first time and sees an empty inbox with no agents. They must know about the
   CLI, the setup scripts, and the environment variable conventions. Bundling
   an agent into the Familiar would provide an immediate out-of-the-box
   conversational AI experience.

## Current Architecture

### How the daemon bundles work today

The Familiar's `scripts/bundle.mjs` uses esbuild to produce four CJS bundles
from daemon source:

| Bundle | Source | Role |
|--------|--------|------|
| `endo-daemon.cjs` | `daemon/src/daemon-node.js` | Main daemon process |
| `endo-worker.cjs` | `daemon/src/web-server-node.js` | Gateway web server |
| `worker-node.cjs` | `daemon/src/worker-node.js` | Worker subprocess |
| `endo-cli.cjs` | `cli/bin/endo.cjs` | CLI for stop/purge |

Plus one compartment-mapper bundle (`web-page-bundle.js`) for the Chat UI's
web page.

The daemon-manager (`src/daemon-manager.js`) spawns the daemon with
environment variables that redirect built-in formulas to the bundled files:

```js
env: {
  ENDO_WORKER_PATH: workerUrl,              // → endo-worker.cjs
  ENDO_WORKER_SUBPROCESS_PATH: workerSubprocessPath,  // → worker-node.cjs
  ENDO_WEB_PAGE_BUNDLE_PATH: webPageBundlePath,       // → web-page-bundle.js
}
```

### How caplets are loaded

The daemon's `makeUnconfined` stores a formula with a `specifier` field — a
`file://` URL to the agent's `.js` entry point. When the formula is
incarnated, the worker process does:

```js
const namespace = await import(specifierUrl);
return namespace.make(powersP, contextP, { env });
```

Node.js resolves bare imports (`@anthropic-ai/sdk`, etc.) via standard
`node_modules` lookup from the specifier's directory. In the monorepo this
works because `node_modules` is present. In a packaged Familiar, it does not.

### How the APPS formula works

The daemon accepts a `specials` parameter — a map of special formula names to
factory functions. `daemon-node.js` uses this to register the APPS (gateway
web server) formula:

```js
await makeDaemon(powers, daemonLabel, cancel, cancelled, {
  APPS: ({ MAIN, ENDO }) => ({
    type: 'make-unconfined',
    worker: MAIN,
    powers: ENDO,
    specifier: process.env.ENDO_WORKER_PATH || ...,
    env: { ENDO_ADDR: ... },
  }),
});
```

The `Specials` type is:
```ts
type Specials = {
  [specialName: string]: (builtins: Builtins) => Formula;
};
```

The `Builtins` type provides `NONE`, `MAIN`, and `ENDO` formula identifiers.
Each special formula is `preformulate`d during daemon initialization and
becomes available as a `platformName` in the root host's special names.

This is the same mechanism we will use for bundled agents.

## Design

### Bundle the agents with esbuild

Add two new esbuild entries to `scripts/bundle.mjs`:

| Bundle | Source | Role |
|--------|--------|------|
| `endo-lal.cjs` | `packages/lal/agent.js` | Lal agent caplet |
| `endo-fae.cjs` | `packages/fae/agent.js` | Fae agent caplet |

These bundles inline all dependencies — `@anthropic-ai/sdk`, `openai`,
`ollama`, `@endo/exo`, `@endo/marshal`, `@endo/patterns`, etc. — into
single CJS files. The bundled agents have no `node_modules` requirements.

```js
await build({
  ...shared,
  entryPoints: [path.join(repoRoot, 'packages/lal/agent.js')],
  outfile: path.join(familiarRoot, 'bundles/endo-lal.cjs'),
});

await build({
  ...shared,
  entryPoints: [path.join(repoRoot, 'packages/fae/agent.js')],
  outfile: path.join(familiarRoot, 'bundles/endo-fae.cjs'),
});
```

### Dependency Analysis

Neither Lal nor Fae has native binary dependencies. All three LLM provider
SDKs are pure JavaScript HTTP clients:

| Package | Type | Notes |
|---------|------|-------|
| `@anthropic-ai/sdk` | Pure JS | HTTP client using `fetch` / `node:http` |
| `openai` | Pure JS | HTTP client using `fetch` / `node:http` |
| `ollama` | Pure JS | HTTP client using `fetch` / `node:http` |

The `@endo/*` workspace packages (`@endo/exo`, `@endo/marshal`,
`@endo/patterns`, `@endo/eventual-send`, `@endo/errors`, etc.) are also
pure JavaScript. None require native modules or `node-gyp`.

Fae imports `@endo/lal/providers/index.js` for its LLM provider — esbuild
follows this cross-workspace import and inlines it.

The only potential concern is the `bufferutil` and `utf-8-validate` optional
WebSocket dependencies, which are already marked `external` in the shared
esbuild config. These are not used by the agent caplets (they belong to the
daemon's WebSocket server), so they are not a factor.

**Conclusion: No binary dependencies need replacement.** The agents can be
bundled as-is.

### SES Compatibility

The agent bundles will run inside an already-locked-down SES worker. Per the
CLAUDE.md architectural constraint:

> Unconfined plugins (e.g., `web-server-node.js`) run inside an
> already-locked-down worker and must **not** import `ses` or `@endo/init`
> themselves; doing so causes double-lockdown errors.

Neither `agent.js` in Lal nor Fae imports `ses` or `@endo/init`. They import
`@endo/exo`, `@endo/patterns`, `@endo/marshal`, and `@endo/eventual-send`,
all of which assume SES globals (`harden`, `Compartment`) are already present.

The esbuild `import.meta.url` plugin is already applied to all bundles. The
agents use `import.meta.url` only in `setup.js` (for `new URL('agent.js',
import.meta.url)`), not in `agent.js` itself. If any transitive dependency
uses `import.meta.url`, the plugin handles it correctly.

### Register Agents as Special Formulas

The daemon-manager passes environment variables to the daemon process. These
tell the daemon where to find the bundled worker. For agents, we extend this
pattern with new environment variables:

```js
env: {
  ...process.env,
  ENDO_WORKER_PATH: workerUrl,
  ENDO_WORKER_SUBPROCESS_PATH: resourcePaths.workerSubprocessPath,
  ENDO_WEB_PAGE_BUNDLE_PATH: resourcePaths.webPageBundlePath,
  ENDO_LAL_PATH: pathToFileURL(resourcePaths.endoLalPath).href,
  ENDO_FAE_PATH: pathToFileURL(resourcePaths.endoFaePath).href,
},
```

In `daemon-node.js`, these become special formulas alongside APPS:

```js
await makeDaemon(powers, daemonLabel, cancel, cancelled, {
  APPS: ({ MAIN, ENDO }) => ({
    type: 'make-unconfined',
    worker: MAIN,
    powers: ENDO,
    specifier: process.env.ENDO_WORKER_PATH || ...,
    env: { ENDO_ADDR: ... },
  }),
  ...(process.env.ENDO_LAL_PATH ? {
    LAL: ({ MAIN, ENDO }) => ({
      type: 'make-unconfined',
      worker: MAIN,
      powers: ENDO,
      specifier: process.env.ENDO_LAL_PATH,
      env: {},
    }),
  } : {}),
  ...(process.env.ENDO_FAE_PATH ? {
    FAE: ({ MAIN, ENDO }) => ({
      type: 'make-unconfined',
      worker: MAIN,
      powers: ENDO,
      specifier: process.env.ENDO_FAE_PATH,
      env: {},
    }),
  } : {}),
});
```

Wait — this does not work for agents that need a guest profile. The `powers`
field in the formula determines what identity the agent runs under. APPS runs
under `ENDO` (the root endo bootstrap), which gives it full daemon access.
Agents should run under their own guest profile.

### The Powers Problem

The `Specials` mechanism maps a name to a formula that is `preformulate`d
during daemon initialization — before the root host, pet stores, or guest
profiles exist. Special formulas have access to `Builtins` (`NONE`, `MAIN`,
`ENDO`) but not to host-level powers like `provideGuest`.

The APPS formula works because the web server needs root-level access
(it serves all agents). Agent caplets, however, should run under a guest
profile with limited authority.

**Two options:**

#### Option A: Special formulas that provision themselves

The agent's `make()` function receives `ENDO` powers (the full endo
bootstrap). Its first act is to create its own guest profile and then operate
under that guest's powers:

```js
export const make = async (endoPowers) => {
  const host = await E(endoPowers).host();
  const guest = await E(host).provideGuest('lal', {
    introducedNames: {},
    agentName: 'profile-for-lal',
  });
  // Now operate using guest powers...
};
```

This gives the agent a bootstrap period with full authority, which it
voluntarily drops by delegating to a guest profile.

**Drawback:** The agent briefly has root access. A bug in the bootstrap
sequence could accidentally exercise root powers.

**Benefit:** Self-contained. No changes to the daemon's special formula
mechanism. Follows the existing APPS pattern (APPS also runs with ENDO
powers).

#### Option B: Setup as a separate special formula

Register two special formulas per agent: a one-shot setup formula and the
agent formula. The setup formula runs with ENDO powers, creates the guest
profile, and the agent formula runs with the guest profile as its powers.

**Drawback:** Complex. Requires orchestrating formula dependencies between
setup and agent, and the `Specials` mechanism does not support inter-formula
dependencies (each formula is independent).

#### Option C: Hardcoded guest provisioning in the daemon

Add guest provisioning logic to `daemon-node.js` (or `daemon.js`) that runs
after the host is created but before signalling "ready". This is analogous
to how `daemon-node.js` already checks for APPS and looks up its address.

```js
const host = await E(endoBootstrap).host();
// ... existing APPS lookup ...

// Provision bundled agents
if (process.env.ENDO_LAL_PATH) {
  if (!(await E(host).has('lal'))) {
    const guest = await E(host).provideGuest('lal', {
      introducedNames: { AGENT: 'AGENT' },
      agentName: 'profile-for-lal',
    });
    await E(host).makeUnconfined('MAIN', process.env.ENDO_LAL_PATH, {
      powersName: 'profile-for-lal',
      resultName: 'controller-for-lal',
    });
  }
}
```

**Drawback:** Mixes agent provisioning concerns into the daemon node entry
point.

**Benefit:** The agent runs with proper guest-level authority from the start.
The provisioning is idempotent (`provideGuest` returns existing guests).

**Resolution: Option A.** The agent receives ENDO powers and provisions
itself. This parallels APPS, keeps the daemon entry point clean, and matches
the direction of [lal-fae-form-provisioning](lal-fae-form-provisioning.md)
where the agent's first act is to send a configuration form to HOST — an
operation that requires looking up HOST, which the agent can do from either
ENDO or guest powers.

The brief bootstrap window with full authority is acceptable because:
1. The agent code is bundled and shipped by us, not user-provided.
2. The APPS formula already has this pattern and has worked without issues.
3. The agent voluntarily drops to guest-level authority immediately.

### Revised Special Formula Registration

```js
const specials = {
  APPS: ({ MAIN, ENDO }) => ({ ... }),
};

if (process.env.ENDO_LAL_PATH) {
  specials.LAL = ({ MAIN, ENDO }) => ({
    type: 'make-unconfined',
    worker: MAIN,
    powers: ENDO,
    specifier: process.env.ENDO_LAL_PATH,
    env: {},
  });
}

if (process.env.ENDO_FAE_PATH) {
  specials.FAE = ({ MAIN, ENDO }) => ({
    type: 'make-unconfined',
    worker: MAIN,
    powers: ENDO,
    specifier: process.env.ENDO_FAE_PATH,
    env: {},
  });
}

await makeDaemon(powers, daemonLabel, cancel, cancelled, specials);
```

### Agent Self-Provisioning

The agent's `make()` function changes to handle both the bundled case (ENDO
powers, no `env`) and the standalone case (guest powers, `env` with LLM
config). Today, the signature is:

```js
export const make = (guestPowers, context, { env }) => { ... };
```

For the bundled case, the agent detects that it has ENDO powers (by checking
for the `host()` method) and provisions itself:

```js
export const make = async (powers, context, options = {}) => {
  const { env } = options;

  let guestPowers;
  if (typeof powers.host === 'function' || await hasHostMethod(powers)) {
    // Running as a special formula with ENDO powers.
    // Self-provision: create guest profile and switch to guest powers.
    const host = await E(powers).host();
    const guest = await E(host).provideGuest('lal', {
      introducedNames: { AGENT: 'AGENT' },
      agentName: 'profile-for-lal',
    });
    guestPowers = guest;
  } else {
    // Running as a guest caplet (standalone setup.js flow).
    guestPowers = powers;
  }

  // Continue with guestPowers as before...
};
```

Actually, a simpler detection: check whether `env` is provided. In the
standalone setup flow, `env` carries the LLM config. In the bundled flow,
there is no `env` (or it's empty).

But this conflates two concerns: the powers type and the configuration
source. With the form-based provisioning design
([lal-fae-form-provisioning](lal-fae-form-provisioning.md)), the agent
always sends a configuration form regardless of how it's started — the only
difference is the initial powers level.

**Simpler approach:** The agent caplet always receives ENDO powers in the
bundled case. Its `make()` creates a guest, then proceeds with the
manager/form flow from the form-provisioning design. The standalone
`setup.js` path is retained for development (running from source without
Familiar).

### Resource Paths

Add to `src/resource-paths.js`:

```js
let endoLalPath;
let endoFaePath;

if (isPackaged) {
  endoLalPath = path.join(appRoot, 'bundles', 'endo-lal.cjs');
  endoFaePath = path.join(appRoot, 'bundles', 'endo-fae.cjs');
} else {
  endoLalPath = '';
  endoFaePath = '';
}
```

In dev mode, the paths are empty strings. The daemon-manager only sets the
`ENDO_LAL_PATH` / `ENDO_FAE_PATH` environment variables when the paths are
non-empty:

```js
...(resourcePaths.endoLalPath
  ? { ENDO_LAL_PATH: pathToFileURL(resourcePaths.endoLalPath).href }
  : {}),
...(resourcePaths.endoFaePath
  ? { ENDO_FAE_PATH: pathToFileURL(resourcePaths.endoFaePath).href }
  : {}),
```

In dev mode, the agent specials are not registered and the user installs
agents via the CLI as today. In packaged mode, the agents are bundled and
auto-provisioned.

### Forge Config

Add `'/bundles'` to the packager allowlist in `forge.config.cjs` (if not
already present — it is). The new `endo-lal.cjs` and `endo-fae.cjs` files
land in the `bundles/` directory alongside the existing daemon bundles, so
no Forge config changes are needed.

### First-Run Experience

When the Familiar launches for the first time:

1. The daemon starts with LAL and FAE special formulas.
2. The LAL formula incarnates: the bundled `endo-lal.cjs` is `import()`ed
   in a worker.
3. Lal's `make()` provisions itself as a guest, then sends a configuration
   form to HOST.
4. The form appears in the user's inbox in the Chat UI.
5. The user fills in their API key and preferred model, submits.
6. The agent creates a named persona and begins following its inbox.

On subsequent launches, the daemon's formula store already has the LAL/FAE
formulas persisted. `provideGuest` is idempotent — it returns the existing
guest. The agent resumes its manager loop and respawns workers from persisted
configs.

### Interaction with Form-Based Provisioning

This design is complementary to
[lal-fae-form-provisioning](lal-fae-form-provisioning.md). That design
refactors the agent's lifecycle to use forms for configuration instead of
environment variables. This design makes the agent available inside the
packaged Familiar.

The two designs compose naturally:

1. **Bundled agent** starts with ENDO powers, self-provisions as a guest,
   sends configuration form to HOST.
2. **Form-based provisioning** handles the configuration form, creates named
   agent personas, spawns worker loops.

Without form-based provisioning, the bundled agent would need a different
configuration mechanism (e.g., reading from a config file). With it, the
user experience is: launch Familiar → see form → fill in API key → agent
starts.

### Startup and Incarnation

When the daemon starts and processes special formulas, it calls
`preformulate` for each. This writes the formula to disk (idempotently) and
later incarnates it via `provide()`. The incarnation calls `makeUnconfined`
in the worker, which does `import(specifierUrl)` on the bundled CJS file.

The daemon already incarnates APPS on startup — the root host checks
`has('APPS')` and `lookup('APPS')` to get the gateway address. For LAL/FAE,
the incarnation happens similarly: the host has `LAL` and `FAE` as platform
names, and `lookup('LAL')` triggers the import and `make()` call.

However, unlike APPS which the host explicitly looks up during startup, the
agent formulas should incarnate lazily — only when first accessed. The
`preformulate` step writes the formula but does not eagerly incarnate it.
The first `lookup('LAL')` (or the first message sent to LAL's inbox) triggers
incarnation.

Actually, for the agent to send a form to HOST on startup, it needs to be
incarnated. The question is: should the agent start automatically, or should
the user trigger it?

**Decision: Auto-incarnate on first start.** On fresh daemon state, after
the host is created, the daemon checks for LAL/FAE formulas and looks them
up (triggering incarnation). On subsequent starts, the formulas are already
incarnated and their workers resume from persisted state.

```js
// In daemon-node.js, after the host is ready:
if (process.env.ENDO_LAL_PATH && await E(host).has('LAL')) {
  await E(host).lookup('LAL');
}
if (process.env.ENDO_FAE_PATH && await E(host).has('FAE')) {
  await E(host).lookup('FAE');
}
```

This mirrors the existing APPS pattern.

## Implementation Phases

### Phase 1: esbuild Bundles

- Add `endo-lal.cjs` and `endo-fae.cjs` entries to `scripts/bundle.mjs`.
- Verify the bundles build without errors.
- Test that the bundles can be imported in a worker subprocess (outside the
  monorepo, without `node_modules`).

### Phase 2: Resource Paths and Daemon Manager

- Add `endoLalPath` and `endoFaePath` to `src/resource-paths.js`.
- Pass `ENDO_LAL_PATH` and `ENDO_FAE_PATH` from `src/daemon-manager.js`.
- Add LAL/FAE special formulas to `daemon-node.js` (conditional on env vars).

### Phase 3: Agent Self-Provisioning

- Modify `packages/lal/agent.js` `make()` to detect ENDO-level powers and
  self-provision as a guest.
- Same for `packages/fae/agent.js`.
- This overlaps with [lal-fae-form-provisioning](lal-fae-form-provisioning.md)
  phase 2 — implement together.

### Phase 4: Auto-Incarnation

- Add LAL/FAE lookup to `daemon-node.js` startup sequence (after host
  readiness check).
- Test end-to-end: launch Familiar → agent form appears in inbox.

## Dependencies

- [familiar-daemon-bundling](familiar-daemon-bundling.md) — the esbuild
  infrastructure and `scripts/bundle.mjs` that this design extends.
- [lal-fae-form-provisioning](lal-fae-form-provisioning.md) — the
  form-based configuration flow that the bundled agents use. Not strictly
  required (the agents could fall back to hardcoded config or env vars) but
  provides the intended user experience.

## Files Modified

| File | Change |
|------|--------|
| `packages/familiar/scripts/bundle.mjs` | Add `endo-lal.cjs` and `endo-fae.cjs` esbuild entries |
| `packages/familiar/src/resource-paths.js` | Add `endoLalPath`, `endoFaePath` |
| `packages/familiar/src/daemon-manager.js` | Pass `ENDO_LAL_PATH`, `ENDO_FAE_PATH` env vars |
| `packages/daemon/src/daemon-node.js` | Register LAL/FAE special formulas; auto-incarnate on startup |
| `packages/daemon/src/types.d.ts` | No changes (Specials type is already generic) |
| `packages/lal/agent.js` | Detect ENDO powers and self-provision (or coordinate with form-provisioning) |
| `packages/fae/agent.js` | Same as lal/agent.js |

## Design Decisions

1. **esbuild CJS bundles.** Same approach as the daemon and worker bundles.
   Single-file CJS with all dependencies inlined. No `node_modules` needed
   at runtime.

2. **No native dependencies to replace.** All three LLM provider SDKs
   (`@anthropic-ai/sdk`, `openai`, `ollama`) are pure JavaScript HTTP
   clients. The `@endo/*` packages are also pure JS. The agents bundle
   cleanly without any native module concerns.

3. **Special formulas via `Specials` mechanism.** Reuses the existing
   pattern from APPS. No new daemon infrastructure needed.

4. **ENDO powers with self-provisioning.** The agent receives full daemon
   access initially and voluntarily drops to guest-level authority. This
   parallels APPS and avoids changes to the `Specials` mechanism. The
   bundled agent code is trusted (shipped by us).

5. **Environment variable gating.** The LAL/FAE specials are only registered
   when `ENDO_LAL_PATH` / `ENDO_FAE_PATH` are set. In dev mode, agents are
   installed via the CLI as today. In packaged mode, they auto-register.

6. **Auto-incarnation on startup.** The agents start automatically when the
   daemon first boots (or when their formula is first incarnated). This
   enables the immediate first-run experience: launch Familiar → form
   appears.

7. **Complementary to form-provisioning.** This design provides the
   delivery mechanism (bundling and registration). The form-provisioning
   design provides the configuration mechanism (form → guest → worker loop).
   Together they produce the complete out-of-the-box experience.

## Related Designs

- [familiar-daemon-bundling](familiar-daemon-bundling.md) — the esbuild
  bundling infrastructure this design extends.
- [familiar-electron-shell](familiar-electron-shell.md) — the Familiar
  architecture including resource paths and daemon management.
- [lal-fae-form-provisioning](lal-fae-form-provisioning.md) — form-based
  agent configuration that provides the user-facing setup flow.
- [daemon-form-request](daemon-form-request.md) — the form primitives
  used for agent configuration.
