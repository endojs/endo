# `@endo/agent-tools`

`@endo/agent-tools` is an embeddable tool and adapter layer for Endo agents.
It owns provider-independent tool records, code-mode evaluation, capability
declarations, and provider bridges.
It is not a complete Pi harness, interactive loop, transcript store, or CLI.

`@endo/agentry` owns the complete Pi harness, including agent construction,
the code-mode preset and prompt assembly, session behavior, eval runners, and
the future packaged CLI.
An external MCP server is a separate consumer of `@endo/agent-tools`.

## One tool, two hosts

The host-independent code-mode surface is the `evaluate({ source })` tool,
its generated capability declarations, and its provider adapters.
The same tool can run on either of two hosts.

The in-process host is `makeCompartmentEvaluate`.
It evaluates source in a fresh SES `Compartment`, with no daemon, credentials,
or network authority.
It suits evals, CI, tests, and a standalone MCP demo.
Results live only as long as the process.

The daemon host is `makeDaemonEvaluate`.
It forwards source and lexical capability names through a live powers reference
to a daemon-style host's `evaluate` method.
The daemon host is intended for real agent use and provides durable results,
pet-name storage, resume, mailbox, and remote messaging.
It imports no daemon implementation.

Storage authority is an explicit host concern.
The settled host policy is that an in-process host without a store exposes the
`{ source }` schema, while a supplied store enables the `resultName` parameter.
An in-memory map is sufficient for light tests.
The follow-up that makes this conditional schema operational is intentionally
outside this relocation; this PR preserves the existing result forwarding and
storage hooks through the `evaluate` rename.

## Layout

| Path | Purpose |
| --- | --- |
| `src/tool.js` | Provider-independent `makeTool` and `ToolRecord`. |
| `src/json-tools/` | Parked JSON wrappers for Git, mounts, filesystem, shell, and HTTP. |
| `src/code-mode/` | Evaluation tool, Compartment host, daemon host, and declaration formatting. |
| `src/code-mode-globals/` | Per-capability global descriptor factories. |
| `src/adapters/` | Pi and SmallCaps bridges; MCP, Codex, and Claude Code shapes are planned. |
| `generated/code-mode-globals/` | Checked-in generated declaration artifacts. |

The code-generation extractors currently read the checked-in
`packages/exo-git/src/types.ts` and the platform filesystem guards through raw
relative paths.
Declared package references are the intended long-term shape.

## Exports

The package root exports the parked JSON record makers and their types:

```js
import {
  makeTool,
  makeGitHistoryTool,
  makeGitTool,
  makeGitMountTools,
  makeGitRemoteTool,
  makeMountReadTool,
  makeMountListTool,
  makeMountStatTool,
  makeMountEditTool,
  makeMountFsTools,
  makeShellTool,
  makeHttpTool,
} from '@endo/agent-tools';
```

Scoped imports expose each layer:

```js
import { makeEvaluateTool } from '@endo/agent-tools/code-mode/evaluate-tool.js';
import { makeCompartmentEvaluate } from '@endo/agent-tools/code-mode/compartment.js';
import { makeDaemonEvaluate } from '@endo/agent-tools/code-mode/daemon.js';
import { makeGitGlobal } from '@endo/agent-tools/code-mode-globals/git.js';
import { makeWorkspaceGlobal } from '@endo/agent-tools/code-mode-globals/fs.js';
import { toPiAgentTool } from '@endo/agent-tools/pi';
import { toolResultToSmallcaps } from '@endo/agent-tools/adapters/smallcaps.js';
```

The Pi packages remain optional peer dependencies.
Importing the root or a non-Pi module does not opt a consumer into Pi.

Planned adapter modules have shape only in this release.
The MCP adapter is not implemented, and Codex and Claude Code adapters are
future provider bridges over the same tool records.

## Parked JSON wrappers

The JSON wrappers remain available for hosts that need one call per action.
They are provider-independent but are parked while code mode is the primary
way to compose several capability operations.

```js
import { makeGitTool } from '@endo/agent-tools/json-tools/git.js';
import { makeGitMountTools } from '@endo/agent-tools/json-tools/git-mount.js';
import { makeMountFsTools } from '@endo/agent-tools/json-tools/fs.js';
import { makeShellTool } from '@endo/agent-tools/json-tools/shell.js';
import { makeHttpTool } from '@endo/agent-tools/json-tools/http.js';
```

`makeTool` produces a `ToolRecord` with a JSON-schema `parameters`, the same
schema as `inputSchema`, and an `invoke(args)` function.
`toPiAgentTool` maps that record to the optional Pi `AgentTool` contract and
accepts a result renderer.

The SmallCaps renderer is supplied by `adapters/smallcaps.js` so plain-data
completion values preserve BigInts, `undefined`, and sigil-prefixed strings.
Capability-bearing values remain out of band.

## Git history tools

The default `makeGitTool` inventory excludes history-rewriting operations.
Hosts that deliberately grant the elevated history capability can use
`makeGitHistoryTool` to expose `commit` with `options.amend`, `reword`,
`cherryPick`, and an autosquash-capable `rebase` start operation.
Rebase control modes remain available through the elevated code-mode Git
capability, but are not exposed as JSON tools.
