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
  makeMountReadTool,
} from '@endo/agent-tools';
```

```ts
import type { ToolRecord, ToolSpec } from '@endo/agent-tools';
```

Subpath exports are also available:

```js
import { makeTool } from '@endo/agent-tools/tool.js';
import { makeGitTool } from '@endo/agent-tools/git-tool.js';
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

Methods that require remotable arguments or can return live capabilities, such
as `status`, `add`, `restore`, and `filesystemAt`, are not included in this
first slice.

## Filesystem Tool

`makeMountReadTool(fs)` builds one read-only `mountReadText` tool over an
`@endo/endo-fs` `Filesystem` capability:

```js
import { readOnly } from '@endo/endo-fs';
import { makeMountReadTool } from '@endo/agent-tools/mount-fs.js';

const readTool = makeMountReadTool(readOnly(projectFs));
const content = await readTool.execute({ path: 'README.md' });
```

The tool reads UTF-8 text by walking the filesystem tree, opening the final
file, and reading a bounded byte range. The supplied `Filesystem` capability
enforces containment, symlink handling, attenuation, subtree scoping, and
revocation. The tool retains the same 50k character text cap as the existing
file reader.

## Schema Conformance

JSON Schemas are hand-authored. The package tests compare those schemas with
the runtime `@endo/patterns` guards so schema drift is caught in CI.
