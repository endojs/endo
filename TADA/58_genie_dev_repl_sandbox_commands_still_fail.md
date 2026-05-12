# @endo/genie dev-repl using sandbox still cannot spawn commands

- I suspect that there's something wrong with the bwrap driver still

1. [x] investigate, analyze, even try running it using some of the example
   one-shot commands below; create follow-up `TODO/` tasks to fix and
   regression test whatever you find here

2. [x] clearly we do not want an integration test that depends on an external
   LLM like ollama to work, report back here on with a plan on how we can use a
   test fake `FauxLLM` with things like canned tool use responses for this

## Investigation summary

The bwrap driver itself is **not** broken.  Driving `mintGenieSlice`
+ `buildGenieTools` directly with the same shapes the dev-repl emits
(see `packages/genie/tmp-repro-sandbox{,2,3}.mjs`) reproduces every
"✗ failed" the LLM ran into, and in every case the root cause is on
the genie/agent side, not the slice:

| Pattern from TODO                                           | Actual cause                                                                                          | Follow-up |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| `bash {"args":["ls -R"]}`                                   | Works fine (`shell:true` joins argv before `/bin/sh -c`); prior failures were `exec`-not-`bash`.      | —         |
| `bash {"args":"[\"uname\", \"-a\"]"}`                       | Works — `makeTool`'s JSON-string fixup unwraps the stringified array before schema validation.        | —         |
| `exec {"args":["ps","aux","|","head","-15"]}`               | Legitimate non-zero exit: `exec` does *not* go through a shell, so `\|` is a literal argv to `ps`.    | TODO/60   |
| `exec {"args":["ls","/home/jcorbin/endo/.../workspace_dev"]}` | Host path is not bound inside the slice (only `/workspace` is).  `ls` exits 2 with `No such file…`. | TODO/62   |
| Any non-zero exit                                           | `runProcess` throws `Command failed with exit code N` and drops stdout/stderr — the model can't self-correct. | TODO/59   |

All four observations turned into follow-up TODOs:

- **`TODO/59_genie_command_tool_failure_diagnostics.md`** — attach the
  trimmed stderr / stdout / command string to the error thrown from
  `runProcess` so the dev-repl's `✗ failed:` line surfaces *why* a
  command failed.  Lands first because it makes everything else
  debuggable.
- **`TODO/60_genie_command_tool_nonzero_exit_as_data.md`** — drop the
  "throw on non-zero exit" branch in `runProcess` and return the
  `{ success, exitCode, stdout, stderr, command }` record the schema
  already advertises.  This is the root cause of most TODO/58
  "failures": a legitimate non-zero exit (grep miss, ps with a pipe
  arg, `test -f` on a missing path) looks like a tool failure rather
  than a result.
- **`TODO/61_genie_faux_llm_integration_test.md`** — replace the
  ollama dependency in `test:integration:dev-repl-sandbox` /
  `test:integration:sandbox-slice` with `@mariozechner/pi-ai`'s
  built-in `faux` provider (see plan below).
- **`TODO/62_genie_system_prompt_slice_workspace_path.md`** — make the
  system prompt name `/workspace` whenever a slice spawner is bound,
  so the model stops reaching for the host workspace path it learned
  from `runtimeInfo()`.

The slice itself is healthy: `tmp-repro-sandbox{,2,3}.mjs` confirm
that `bash uname -a`, `bash free -h`, `bash ls -R`, `bash find .`,
`exec echo …`, `exec ls /workspace`, and the JSON-string-args fallback
all succeed inside a bwrap slice on this host (`bubblewrap 0.11.2`,
`kernel.unprivileged_userns_clone=1`).

## FauxLLM plan (resolves Task 2)

`@mariozechner/pi-ai` already ships a `faux` provider under
`node_modules/.../pi-ai/dist/providers/faux.js`.  Its public surface:

```ts
import {
  fauxAssistantMessage,
  fauxToolCall,
  fauxText,
  registerFauxProvider,
} from '@mariozechner/pi-ai/providers/faux';

const handle = registerFauxProvider({ api, provider, models });
handle.setResponses([
  fauxAssistantMessage([fauxToolCall('bash', { args: ['pwd'] })]),
  // factory step — sees prior tool results in `context.messages`:
  (context /*…*/) => fauxAssistantMessage([fauxText(context.messages.at(-1).content)]),
]);
```

`registerFauxProvider` plugs into the same `pi-ai` registry the genie
already drives, so `runAgentRound` consumes it like any other
provider — no changes needed in `agent/index.js`, `buildGenieTools`,
or the dev-repl loop.

Concrete shape (full task list in TODO/61):

1. Add `packages/genie/test/_helpers/faux.js` exposing
   `scriptedAgent({ steps })` that registers the provider, queues the
   steps, and returns a model id (`'faux/script-1'`) the dev-repl can
   take via `-m`.  The helper cleans up via `t.teardown(() =>
   unregister())` so AVA `test.serial` files don't trample one
   another.
2. Convert `test/dev-repl-sandbox.test.js` to drive the faux model
   instead of `ollama/llama3.2`.  Step 1 emits a `bash` tool call
   probing `pwd && uname -a && ls /workspace`; step 2 (factory) reads
   the prior tool result from `context.messages` and emits a final
   assistant text the test greps.  Assertions become real (slice cwd
   == `/workspace`, kernel string visible, mount bytes visible) and
   the LLM-flake `SKIP:` cases disappear.
3. Mirror in `test/scenarios/sandbox-slice.scenario.js` (daemon
   path); the faux model id rides through `GENIE_MODEL`.
4. Keep the `bwrap`/userns skips — those are real host capability
   gaps — but drop the ollama skip entirely.

Why this is the right tool rather than rolling our own fake:

- The faux provider runs entirely in-process (no network, no model
  download) so the tests stay fast and deterministic.
- The "canned response" surface already supports both static
  `AssistantMessage`s and factory functions that see the prior tool
  results — exactly what's needed to drive a multi-turn probe.
- It registers through the same `pi-ai` registry the dev-repl
  already calls, so the seam is the model-id string the operator
  passes via `-m`.  No agent-side scaffolding leaks into production
  code.

## Example Testing Commands

```bash
$ yarn workspace @endo/genie run repl -m ollama/gemma4 -c 'test the "exec" command'

$ yarn workspace @endo/genie run repl -m ollama/glm-4.7-flash -c 'test the "exec" command'

$ yarn workspace @endo/genie run repl -m ollama/gemma4 -c 'test the "bash" command to explore and inspect the operating system'
```

## Example failures form "bash" tool

```
⚡ bash {"args":["ls -R"]}
✗ failed: Error: Tool execution failed: {"content":[{"type":"text","text":"bash execution failed: Command failed with exit code 1"}],"details":{}}

⚡ bash {"args":["find ."]}
✗ failed: Error: Tool execution failed: {"content":[{"type":"text","text":"bash execution failed: Command failed with exit code 1"}],"details":{}}

⚡ bash {"args":"[\"uname\", \"-a\"]"}
✗ failed: Error: Tool execution failed: {"content":[{"type":"text","text":"bash execution failed: Command failed with exit code 1"}],"details":{}}

⚡ bash {"args":"[\"free\", \"-h\"]"}
✗ failed: Error: Tool execution failed: {"content":[{"type":"text","text":"bash execution failed: Command failed with exit code 1"}],"details":{}}

⚡ exec {"args":"[\"ps\", \"aux\", \"|\", \"head\", \"-15\"]"}
✗ failed: Error: Tool execution failed: {"content":[{"type":"text","text":"exec execution failed: Command failed with exit code 1"}],"details":{}}
```

## Example failures form "exec" tool

```
⚡ exec {"args":"[\"echo\", \"Hello from exec command\"]"}
✗ failed: Error: Tool execution failed: {"content":[{"type":"text","text":"exec execution failed: Command failed with exit code 1"}],"details":{}}

⚡ exec {"args":"[\"ls\", \"/home/jcorbin/endo/packages/genie/workspace_dev\"]"}
✗ failed: Error: Tool execution failed: {"content":[{"type":"text","text":"exec execution failed: Command failed with exit code 1"}],"details":{}}
```
