# `@endo/agent-tools`

Provider-independent agent tool records for Endo capabilities.

The package helps adapters expose Endo capabilities to LLM or MCP-style tool
callers without giving those callers ambient authority. Each tool record pairs
a JSON Schema with an `invoke(args)` function that validates the named
arguments before dispatching to a capability.

## Exports

```js
import {
  makeTool,
  makeGitTool,
  makeGitMountTools,
  makeMountReadTool,
  makeMountListTool,
  makeMountStatTool,
  makeMountEditTool,
  makeMountFsTools,
} from '@endo/agent-tools';
```

```ts
import type { ToolRecord, ToolSpec } from '@endo/agent-tools';
```

Subpath exports are also available:

```js
import { makeTool } from '@endo/agent-tools/tool.js';
import { makeGitTool } from '@endo/agent-tools/git-tool.js';
import { makeGitMountTools } from '@endo/agent-tools/git-mount-tool.js';
import { makeMountReadTool } from '@endo/agent-tools/mount-fs.js';
```

## Tool Records

A tool record has the shape:

```ts
interface ToolRecord {
  name: string;
  description: string;
  parameters: object;
  inputSchema: object;
  invoke(args: Record<string, unknown>): Promise<unknown>;
}
```

`parameters` and `inputSchema` are the same JSON Schema object. Adapters can
use `parameters` for LLM tool definitions and `inputSchema` for MCP tool
definitions.

## Named Arguments

`makeTool` accepts optional positional guards, but callers pass a JSON object.
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

This is the current MCP-facing wire shape: MCP tool calls use named JSON
object properties, so the adapter gives positional APIs stable `argN` names.
A future adapter can expose separate variants that accept `{ args: [...] }` or
another positional shape when the caller supports it.

When guards are present, `invoke` rejects unknown `argN` keys, rejects missing
required arguments declared by the schema, copy-hardens incoming parsed JSON
objects, and validates supplied positional arguments with `mustMatch` before
calling `execute`.

## Git Tools

`makeGitTool(gitCap)` builds tool records over a live `@endo/exo-git` `Git`
capability:

```js
const tools = makeGitTool(git);
```

The current slice exposes:

- `log`
- `diff`
- `show`
- `commit`
- `branches`
- `createBranch`
- `switchBranch`
- `currentBranch`

This slice holds only the JSON-transparent methods whose hand-authored tool
schema maps one-to-one onto their `GitInterface` guard. Methods whose native
signatures traffic in live capabilities — `status` (its rows carry mount-entry
remotables) and `add` (it takes an array of mount-entry remotables) — are
served instead by `makeGitMountTools` below. `restore` and `filesystemAt`
remain deferred.

`makeGitMountTools(gitCap)` bridges the two capability-bearing methods at the
wire boundary, so the model still sees only JSON:

```js
const mountTools = makeGitMountTools(git);
```

- `status` projects each row to a JSON-safe `{ path, index, worktree }` (plus
  `renamedFrom` on a rename), stripping the authority-bearing `entry`/`node`
  remotables so none crosses the tool wire.
- `add` takes mount-relative path strings, resolves each to an `EndoMountEntry`
  minted by the worktree mount, and stages additively (never discarding
  working-tree changes). A `..` segment is contained by the mount, clamped at
  the worktree root rather than escaping it; a path that addresses only the
  root (`.`, `/`) is rejected.

The two makers compose into the full status/diff/log/add/commit surface:

```js
const gitTools = [...makeGitTool(git), ...makeGitMountTools(git)];
```

`add`/`status` deliberately live outside `makeGitTool` so its one-to-one
schema-to-guard divergence gate stays intact; `makeGitMountTools`'s tool wire
diverges from the raw `Git` guard by design.

## Filesystem Tools

The file-tool set covers read, list, stat, and edit over an
`@endo/platform/fs/extended` `Filesystem` capability. The same set serves the
live worktree (`mountAsFilesystem(mount)`) and history (`Git.filesystemAt(ref)`)
unchanged, because both present the same `Filesystem` shape. Each tool holds the
capability, not a path string: containment, symlink handling, attenuation,
subtree scoping, and fail-closed revocation are the capability's guarantees.

| Maker | Tool `name` | Slice |
|---|---|---|
| `makeMountReadTool(fs, opts?)` | `mountReadText` | read (bounded UTF-8 text; 50k-char default cap, `maxChars: 0` disables) |
| `makeMountListTool(fs)` | `mountList` | read (name/kind entries of a directory) |
| `makeMountStatTool(fs)` | `mountStat` | read (kind and size / mtime / atime; `bigint`s decimal-string-encoded) |
| `makeMountEditTool(fs)` | `mountWriteText` | write (whole-file create-or-overwrite) |

`makeMountFsTools(fs, opts?)` composes the whole set as a `ToolRecord[]`:

```js
import { readOnly } from '@endo/platform/fs/extended';
import { makeMountFsTools } from '@endo/agent-tools/mount-fs.js';

// Writable agent: read + list + stat + edit.
const tools = makeMountFsTools(projectFs);

// Read-only agent: the edit tool is filtered out at construction, so it is
// never advertised to the model. Attenuate the capability as well so an edit
// also fails closed at the cap.
const readOnlyTools = makeMountFsTools(readOnly(projectFs), { readOnly: true });
```

The read / list / stat tools carry a build-time `scope: 'read'` tag and the edit
tool `scope: 'write'`. When `opts.readOnly` is set the write slice is dropped at
construction; the `scope` tag is build-time only and never reaches the wire
schema the model receives (the same discipline `makeGitTool` applies via
`isGitReadOnly`). Because a `Filesystem` capability is an `ERef` with no
synchronous read-only probe, the host declares the attenuation through
`opts.readOnly` rather than by cap inspection.

Inherited `Filesystem` limits apply: whole-file reads and writes (no partial
range at the mount backing), no POSIX mode / uid / gid, and directory `size`
reported as the base seam's `0`. The edit tool overwrites an existing-or-new
child of an existing directory; it does not create intermediate directories.

## Schema Conformance

JSON Schemas are hand-authored. The package tests compare those schemas with
the runtime `@endo/patterns` guards so schema drift is caught in CI.
