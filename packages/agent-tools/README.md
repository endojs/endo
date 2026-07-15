# `@endo/agent-tools`

Provider-independent tool surfaces over Endo capabilities such as Git,
filesystem, shell, and HTTP.
Code mode is the primary agent surface: it lets a model compose operations
against the capabilities it has been given.

## Code mode

The code-mode tool is `evaluate({ source })`.
It runs model-authored JavaScript with declared capability globals such as
`git` and `workspace` in lexical scope.
The model uses `E()` for eventual sends, so capability calls remain explicit
and work for local or remote references:

```js
const result = await evaluate({
  source: `
    const branch = await E(git).currentBranch();
    return branch;
  `,
});
```

Per-capability type declarations make those globals legible to the model
before it writes code.
The declarations describe the methods available through each granted
capability, while the capability itself remains the authority boundary.

The pi adapter is today's harness bridge.
`toPiAgentTool` converts a provider-independent tool record into the
`pi-agent-core` `AgentTool` shape and lets the caller supply its result
renderer.

The code-mode implementation currently lives in `@endo/agentry` as the
`execute({ source, resultName? })` tool and its hosts, globals, and generated
declarations.
Relocation into `@endo/agent-tools` is planned; the target tool name is
`evaluate`.
`@endo/agentry` will remain responsible for harness assembly, including model
and credential resolution and final prompt assembly.

## Planned layout

The following layout lands with the relocation work:

| Planned path | Contents |
|---|---|
| `src/json-tools/` | Parked JSON wrappers for Git, mounts, filesystem, shell, and HTTP. |
| `src/code-mode/` | The `evaluate` tool, the in-process Compartment host, the daemon host, and declaration rendering. |
| `src/code-mode-globals/` | Per-capability global descriptors; the growth surface for Git, filesystem, HTTP, timer, and more. |
| `src/adapters/` | Provider bridges, with pi today and MCP, Codex, and Claude Code planned. |
| `generated/code-mode-globals/` | Checked-in generated declaration artifacts. |

The in-process Compartment host evaluates code without daemon, credential, or
network authority and is useful for tests and lightweight harnesses.
The daemon host forwards evaluation through a live powers reference for durable
agent use.
The pi adapter bridges tool records to `pi-agent-core`.
MCP, Codex, and Claude Code adapters are planned provider bridges.

## Exports

The package root exports the JSON tool makers and their types:

```js
import {
  makeTool,
  makeGitHistoryTool,
  makeGitTool,
  makeGitMountTools,
  makeMountReadTool,
  makeMountListTool,
  makeMountStatTool,
  makeMountEditTool,
  makeMountFsTools,
  makeShellTool,
  makeHttpTool,
} from '@endo/agent-tools';
```

```ts
import type { ToolRecord, ToolSpec } from '@endo/agent-tools';
```

The documented subpaths expose the same makers by capability family, plus the
pi adapter:

```js
import { toPiAgentTool } from '@endo/agent-tools/pi';
import { makeTool } from '@endo/agent-tools/tool.js';
import { makeGitHistoryTool, makeGitTool } from '@endo/agent-tools/git-tool.js';
import { makeGitMountTools } from '@endo/agent-tools/git-mount-tool.js';
import { makeShellTool } from '@endo/agent-tools/shell-tool.js';
import { makeHttpTool } from '@endo/agent-tools/http-tool.js';
import {
  makeMountReadTool,
  makeMountListTool,
  makeMountStatTool,
  makeMountEditTool,
  makeMountFsTools,
} from '@endo/agent-tools/mount-fs.js';
```

## JSON Tool Records (parked)

The retained JSON layer provides these makers:
`makeTool`, `makeGitTool`, `makeGitHistoryTool`, `makeGitMountTools`,
`makeMountReadTool`, `makeMountListTool`, `makeMountStatTool`,
`makeMountEditTool`, `makeMountFsTools`, `makeShellTool`, and `makeHttpTool`.
These wrappers remain available for hosts that need one JSON call per action,
but this layer is not being expanded; code mode is the direction for composing
multiple capability operations.

A tool record has a JSON-schema `parameters` object, the same schema as
`inputSchema`, and an `invoke(args)` function:

```ts
interface ToolRecord {
  name: string;
  description: string;
  parameters: object;
  inputSchema: object;
  invoke(args: Record<string, unknown>): Promise<unknown>;
}
```

`parameters` is the LLM tool schema and `inputSchema` is the MCP tool schema.
`invoke` validates the named JSON arguments against the configured guards,
then dispatches to the capability.

### Named arguments

`makeTool` accepts optional positional guards, but callers pass one JSON object.
The positional arguments are encoded as `arg0`, `arg1`, and so on:

```js
const tool = makeTool({
  name: 'commit',
  description: 'Record staged changes as a new commit.',
  parameters: harden({
    type: 'object',
    properties: {
      arg0: { type: 'string', description: 'The commit message.' },
    },
    required: ['arg0'],
    additionalProperties: false,
  }),
  argGuards: harden([M.string()]),
  execute: async ({ arg0 }) => E(git).commit(arg0),
});

await tool.invoke({ arg0: 'Update docs' });
```

When guards are present, `invoke` rejects unknown keys, rejects missing
required arguments declared by the schema, copy-hardens incoming parsed JSON
objects, and validates supplied positional arguments with `mustMatch` before
calling `execute`.

### Git tools

`makeGitTool(gitCap)` builds records over a live `@endo/exo-git` `Git`
capability.
Its standard records cover `log`, `diff`, `show`, `commit`, `branches`,
`createBranch`, `switchBranch`, and `currentBranch`.
The standard `commit` record creates a commit and does not accept
`options.amend`.

`makeGitHistoryTool(gitCap)` is the separate history-rewrite set.
It exposes `commit` with `options.amend` and `reword`.
Do not combine it with `makeGitTool` without resolving the duplicate `commit`
name in the host's catalog.

`makeGitMountTools(gitCap)` bridges Git methods whose native arguments or
results carry mount-entry capabilities while keeping the JSON wire plain.
It provides JSON-safe `status` rows and accepts mount-relative path strings for
`add`.
The mount contains `..` traversal at the worktree root and rejects a path that
addresses only the root.

The normal makers compose into a status/diff/log/add/commit surface:

```js
const gitTools = [...makeGitTool(git), ...makeGitMountTools(git)];
```

### Filesystem tools

The filesystem records operate over an
`@endo/platform/fs/extended` `Filesystem` capability.
The same set serves a live worktree and Git history because both expose the
same `Filesystem` shape.
Each record holds the capability rather than a path string, so containment,
symlink handling, attenuation, subtree scoping, and revocation remain
capability guarantees.

| Maker | Tool name | Operation |
|---|---|---|
| `makeMountReadTool(fs, opts?)` | `mountReadText` | Bounded UTF-8 text read. |
| `makeMountListTool(fs)` | `mountList` | Directory listing. |
| `makeMountStatTool(fs)` | `mountStat` | Kind and size/mtime/atime. |
| `makeMountEditTool(fs)` | `mountWriteText` | Whole-file create or overwrite. |

`makeMountFsTools(fs, opts?)` composes the four records.
With `readOnly: true`, it omits the edit record at construction:

```js
import { readOnly } from '@endo/platform/fs/extended';
import { makeMountFsTools } from '@endo/agent-tools/mount-fs.js';

const tools = makeMountFsTools(readOnly(projectFs), { readOnly: true });
```

Reads and writes are whole-file operations at the mount backing.
The edit record does not create intermediate directories.

### Shell and HTTP tools

`makeShellTool(shellCap)` provides `exec` for allowlisted argv-only commands
and `inspect` for the shell policy bounds.
The shell capability enforces its allowlist, sanitized environment, timeout,
and output cap; optional reject patterns and flags add an advisory tool-layer
veto.

`makeHttpTool(httpCap)` provides `fetch` and `allowedOrigins`.
The `HttpClient` capability enforces origin allowlisting, rate limits,
response-byte caps, timeouts, redirect containment, and revocation.
`fetch` projects its live response into a JSON-safe record containing status,
headers, truncation, and body text.

### Schema conformance

JSON Schemas are hand-authored.
Package tests compare those schemas with the runtime `@endo/patterns` guards so
schema drift is caught in CI.
