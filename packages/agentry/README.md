# @endo/agentry

Shared infrastructure for building agentic harnesses across endo packages.

The package is intended to grow as a small library of capabilities that more
than one agent harness in the monorepo needs.
Each surface is opt-in via its own subpath export.

## Current surfaces

- `@endo/agentry` (root) — `defineAgent` plus the harness primitives
  (marshalling, the credential seam, model resolution, and the pi-agent
  builder).
- `@endo/agentry/define-agent` — `defineAgent(config)`, which returns a maker
  function: the powerless definition is the closure, and calling the returned
  maker with a powers handle is the powered stage.
- `@endo/agentry/harness` — the code-mode-independent primitives the harness is
  built from: `toolResultToSmallcaps` + the SmallCaps codec, `makeEnvCredentials`
  (the single reader of `process.env`), `resolveModel`/`defineModels`, and
  `makePiAgent`. `@endo/lal` imports these directly.
- `@endo/agentry/execute` — the execute-only code-mode tool and its presets
  (`makeCodeModeAgent`, `makeCodeModeGitLoopAgent`), built on `defineAgent`.

## defineAgent

`defineAgent(config)` returns a **maker function**. The powerless definition —
the resolved model, the system instructions, and the model-facing tool surface —
is captured in the maker's closure and holds no powers. Calling the maker with a
powers handle is the powered stage:

```js
import { defineAgent } from '@endo/agentry';

const makeAgent = defineAgent({
  model: 'sonnet', // a profile id, or a concrete pi-ai Model
  instructions: 'You are a helpful agent.',
  tools: [/* model-facing AgentTools */],
});

const agent = makeAgent(/* powers? */);
await agent.prompt('Hello.');
await agent.waitForIdle();
```

Config is scoped to `{ model, instructions, tools, endow }`. The `endow` hook
derives the powered tool surface and credential resolver from the live powers at
construction time, so the powerless definition never holds a capability.
Importing `@endo/agentry/harness` performs **no** provider registration as a
side effect; instead the harness registers pi-ai's built-in providers lazily, on
first model resolution, so a registry model resolves without any caller-side
setup:

```js
import { defineAgent } from '@endo/agentry';

const makeAgent = defineAgent({
  model: 'anthropic/claude-opus-4-5-20251101',
});
```

`actions`/`skills`/`cwd` are deferred.

## Credential seam

`@endo/agentry/harness` exports `makeEnvCredentials`, the harness's single choke
point for reading secrets. `get(name)` resolves a key out of the ambient process
environment (the default) or a caller-supplied record. Every consumer resolves
secrets through `.get()`, so swapping the env-backed provider for a
capability-scoped secret store is a local change.

## Code mode

Code mode is just an agent whose one tool is `execute`. `makeCodeModeAgent` is
the code-mode preset of `defineAgent`:

```js
import { makeCodeModeAgent } from '@endo/agentry/execute';

const { agent } = makeCodeModeAgent({
  model,
  powers: { workspace, git, gitMode: 'readOnly' }, // or 'readWrite'
});
await agent.prompt('Inspect the current branch.');
await agent.waitForIdle();
```

The model-facing tool surface is intentionally one tool:
`execute({ source, resultName? })`. Workspace and Git operations happen inside
the Endo Compartment through lexical caps (`workspace`, `git`, and any
configured named powers). The lexical globals are advertised to the model by
name and a one-line description only — the model discovers a capability's method
surface at runtime via `E(cap).__getMethodNames__()` rather than reading a
checked-in type declaration.

Plain-data completion values returned from `execute` are encoded for the model
with the SmallCaps marshaller (`@endo/marshal`), so BigInts and other
non-JSON-native passable values round-trip losslessly. Capability-bearing
results are not serialized; the agent keeps them live inside the Compartment and
stores them under a pet name via `resultName` when it needs them across turns.

## Status

This package is private to the endo monorepo. The API is best-effort stable but
pre-1.0 — breaking changes in this package can land in the same PR as their
workspace consumers.
