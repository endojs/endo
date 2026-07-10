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

The default `commit` tool creates a new commit and does not accept
`options.amend`.
History rewriting is intentionally excluded from this default inventory.
Hosts that deliberately grant that authority can construct the separate
elevated tool set:

```js
const historyTools = makeGitHistoryTool(git);
```

It exposes `commit` with `options.amend`, `reword`, `cherryPick`, and an
autosquash-capable `rebase` start operation.
Rebase control modes remain available through the elevated code-mode Git
capability, but are not exposed as JSON tools.
Do not combine this set with `makeGitTool` without resolving the duplicate
`commit` tool name in the host's catalog.
The host controls whether a model sees the normal commit-only or elevated
history-rewrite variant.

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

The normal makers compose into the full status/diff/log/add/commit surface:

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
