# `@endo/agent-tools`

`@endo/agent-tools` is the reusable tool and adapter layer over Endo
capabilities such as Git, filesystem, shell, and HTTP.
It is not a complete user-facing harness or interactive CLI.

The reusable layer owns the `ToolRecord` machinery, the code-mode/evaluate
tool machinery, capability declarations, result-rendering bridges, and
scoped provider adapters.
The existing `./pi` adapter is one such bridge; a scoped `./mcp` adapter is
planned.

`@endo/agentry` is separate harness assembly: it is the complete Pi harness
today and the eventual packaged interactive CLI.
An external MCP server is a separate consumer of `@endo/agent-tools`, not a
part of `@endo/agentry`.

## Contents

- [Code mode](#code-mode)
- [Planned layout](#planned-layout)
- [Exports](#exports)
  - [Tool exports](#tool-exports)
  - [Code-mode exports](#code-mode-exports)
  - [MCP adapter exports](#mcp-adapter-exports)
- [JSON tool records (parked)](#json-tool-records-parked)
  - [Named arguments](#named-arguments)
- [Current capability surface](#current-capability-surface)
  - [Git tools](#git-tools)
  - [Filesystem tools](#filesystem-tools)
  - [Shell and HTTP tools](#shell-and-http-tools)
  - [Schema conformance](#schema-conformance)
- [MCP adapter boundary (planned)](#mcp-adapter-boundary-planned)
  - [MCP's protocol surface](#mcps-protocol-surface)
  - [Current gaps and intended ownership](#current-gaps-and-intended-ownership)

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

The pi adapter is today's provider bridge.
`toPiAgentTool` converts a provider-independent tool record into the
`pi-agent-core` `AgentTool` shape and lets the caller supply its result
renderer.

The code-mode implementation currently lives in `@endo/agentry` as the
`execute({ source, resultName? })` tool and its hosts, globals, and generated
declarations.
Relocation into the reusable `@endo/agent-tools` layer is planned; the target
tool name is `evaluate`.
`@endo/agentry` remains responsible for harness assembly, including model and
credential resolution, Pi execution, and final prompt assembly.

## Planned layout

The following layout lands with the relocation work:

| Planned path | Contents |
|---|---|
| `src/json-tools/` | Parked JSON wrappers for Git, mounts, filesystem, shell, and HTTP. |
| `src/code-mode/` | The `evaluate` tool, the in-process Compartment host, the daemon host, and declaration rendering. |
| `src/code-mode-globals/` | Per-capability global descriptors; the growth surface for Git, filesystem, HTTP, timer, and more. |
| `src/adapters/` | Scoped provider bridges, with pi today and MCP, Codex, and Claude Code planned. |
| `generated/code-mode-globals/` | Checked-in generated declaration artifacts. |

The in-process Compartment host evaluates code without daemon, credential, or
network authority and is useful for tests and lightweight harnesses.
The daemon host forwards evaluation through a live powers reference for durable
agent use.
The pi adapter bridges tool records to `pi-agent-core`.
MCP, Codex, and Claude Code adapters are planned provider bridges.

## Exports

### Tool exports

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
scoped pi adapter:

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

The Pi packages remain optional peer dependencies.
Importing the root or a non-Pi subpath does not opt a consumer into a Pi
provider.
Import `@endo/agent-tools/pi` only for the Pi bridge.

### Code-mode exports

Code mode is not exported from `@endo/agent-tools` yet.
The implementation currently lives in `@endo/agentry` as the
`execute({ source, resultName? })` tool and its hosts, globals, and generated
declarations.
Relocation into the reusable `@endo/agent-tools` layer is planned; the target
tool name is `evaluate`.

### MCP adapter exports

An MCP adapter is not exported from `@endo/agent-tools` yet.
The planned adapter will be a separate provider bridge over the provider-
independent tool records.
The adapter's protocol and transport responsibilities are described in the
[MCP adapter boundary](#mcp-adapter-boundary-planned) section.

## JSON tool records (parked)

The retained JSON layer provides these makers:
`makeTool`, `makeGitTool`, `makeGitHistoryTool`, `makeGitMountTools`,
`makeMountReadTool`, `makeMountListTool`, `makeMountStatTool`,
`makeMountEditTool`, `makeMountFsTools`, `makeShellTool`, and `makeHttpTool`.
These wrappers remain available for hosts that need one JSON call per action,
but this layer is not being expanded; code mode is the direction for composing
multiple capability operations.

A local `ToolRecord` has `name`, `description`, a JSON-schema `parameters`
object, the same schema as `inputSchema`, and an `invoke(args)` function.
Its completion value is arbitrary; the local surface has no `outputSchema`
contract.
This is a local record shape, not the complete MCP `Tool` metadata and result
contract.

```ts
interface ToolRecord {
  name: string;
  description: string;
  parameters: object;
  inputSchema: object;
  invoke(args: Record<string, unknown>): Promise<unknown>;
}
```

`parameters` is the local LLM-facing schema name and `inputSchema` is the local
MCP-adjacent schema name.
The current record does not advertise MCP metadata or output behavior.
`invoke` validates the named JSON arguments against the configured guards, then
dispatches to the capability and may return any completion value.

The existing `toPiAgentTool` bridge maps a `ToolRecord` to a pi `AgentTool`.
It invokes the record, currently renders one text result for Pi, and retains
the raw completion value as `details`.
A caller can provide a renderer for its own transcript format.

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

## Current capability surface

The current JSON tool records are grouped by the capability they wrap.

### Git tools

`makeGitTool(gitCap)` builds records over a live `@endo/exo-git` `Git`
capability.
Its default records cover `log`, `diff`, `show`, `commit`, `branches`,
`createBranch`, `switchBranch`, and `currentBranch`.
The default `commit` record creates a commit and does not accept
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

## MCP adapter boundary (planned)

The reference point for a future MCP adapter is the stable
[MCP 2025-11-25 tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools),
alongside its [schema reference](https://modelcontextprotocol.io/specification/2025-11-25/schema)
and [JSON Schema 2020-12 default-dialect SEP](https://modelcontextprotocol.io/seps/1613-establish-json-schema-2020-12-as-default-dialect-f).
This package does not implement that MCP adapter yet.

### MCP's protocol surface

An MCP tool definition includes `name`, optional `title`, `description`,
optional `icons`, required `inputSchema`, optional `outputSchema`, optional
`annotations`, and optional `execution.taskSupport`.
Discovery and invocation are protocol operations: `tools/list` and
`tools/call`.
`tools/list` supports pagination, and a server may advertise `listChanged` and
send `notifications/tools/list_changed` when its tool catalog changes.

An MCP `CallToolResult` has a `content` array of rich content blocks, such as
text, images, audio, resource links, and embedded resources.
It may also carry JSON `structuredContent`.
When `outputSchema` is present, the server must produce structured content that
conforms to it and the client should validate it.
For backward compatibility, a structured result should also include its
serialized JSON in a text content block.

MCP distinguishes JSON-RPC protocol errors from tool execution errors.
Protocol problems such as an unknown tool or malformed request use the JSON-RPC
error response, while a failure from the tool itself is reported in a result
with `isError: true`.

### Current gaps and intended ownership

The following are MCP-facing capabilities for a future adapter or server, not
properties supplied by the current `ToolRecord` or Pi adapter:

| MCP-facing capability | Status in `@endo/agent-tools` |
|---|---|
| Advertise and validate `outputSchema`. | Planned; not implemented. |
| Map arbitrary completions to `structuredContent` and rich content blocks, including the backward-compatible JSON text block. | Planned; not implemented. |
| Carry MCP metadata such as `annotations`, `title`, and `icons`. | Planned; not implemented. |
| Implement MCP discovery, lifecycle, pagination, and `tools/list_changed` notifications. | Planned for an MCP adapter/server; not implemented. |
| Represent task-augmented execution through `execution.taskSupport`. | Not represented by the current `ToolRecord` or Pi adapter; planned for the eventual MCP adapter if supported. |
| Provide MCP transport, JSON-RPC, session, or authorization behavior. | Owned by the external MCP server/transport layer; not part of the provider-independent `ToolRecord`. |

Until that adapter exists, `inputSchema` on a local record should not be read as
an assertion that the package supplies the rest of the MCP tool contract.
