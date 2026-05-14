# System prompt advertises the host workspace path; the slice sees `/workspace`

## Context

While investigating TODO/58 the most reproducible model-side failure
was the agent invoking `exec` (or `bash`) with the *host* workspace
path it learned from the system prompt — e.g.:

```
⚡ exec {"args":["ls", "/home/jcorbin/endo/packages/genie/workspace_dev"]}
✗ failed: Error: Tool execution failed: …
   Command failed with exit code 2
```

Inside a bwrap slice that host path is not bound (only
`SLICE_WORKSPACE_PATH = '/workspace'` is), so `ls` exits 2.  The model
behaves rationally given the prompt:
`src/system/index.js` `runtimeInfo()` yields

```
- **Current working directory:** ${workspaceDir}
  - Treat this directory as your **Workspace** for file operations …
```

where `workspaceDir` is the host path (`process.cwd()` for the
dev-repl, the `GENIE_WORKSPACE` cap target for the daemon).  The
system prompt never tells the model that command-style tools are
routed through a slice that re-roots the workspace at `/workspace`.

The daemon-side `files` / `memory` tools *do* operate against
`workspaceDir`, so the prompt is correct for those — but the asymmetry
is invisible to the model, which has no signal that "bash sees a
different path than readFile."

## Tasks

1. [x] Plumb a slice-awareness signal into `makePiAgent` and
   `buildSystemPrompt`.  Shape sketch: a new optional
   `sliceWorkspacePath` argument (defaults to undefined / not slice-
   backed); when set, the runtime-info section adds a line like:

   ```
   - **Command-tool workspace path:** /workspace
     - `bash`, `exec`, and `git` see the Workspace at this path
       (the host directory above is bind-mounted there).
   ```

   Implemented in `src/system/index.js` (renders the line when
   `sliceWorkspacePath` is set) and `src/agent/index.js`
   (forwards the option into `buildSystemPrompt`).  Also threaded
   through `src/loop/agents.js` (`makeGenieAgents`) so both the
   main chat agent and the dedicated heartbeat agent see the
   slice-aware prompt — observer / reflector run daemon-side and
   never invoke command tools, so the option is intentionally
   omitted on their construction path.

2. [x] Wire the prompt addition from both call sites:
   - `dev-repl.js`: pass `SLICE_WORKSPACE_PATH` when a slice was minted
     (`spawner !== undefined`), and omit it under `--sandbox off`.
   - `main.js` `spawnAgent`: pass `SLICE_WORKSPACE_PATH` whenever the
     sandbox factory produced a handle (i.e. whenever the spawner is
     the slice-backed adapter from `sandbox-spawner.js`).

   Done — both call sites compute `innerSlicePath = slice ?
   SLICE_WORKSPACE_PATH : undefined` (where `slice` is the
   `SandboxHandle` returned from `mintGenieSlice`) and pass it into
   `buildGenieTools` and `makeGenieAgents`.  The `--sandbox off` /
   `--sandbox auto` no-backend / "no `sandbox-factory` cap" paths
   all leave it `undefined` so the single-path runtime-info section
   stays in effect.

3. [x] Update the `bash` / `exec` / `git` tool descriptions (in
   `src/tools/command.js`'s `help()` generator) so the tool-level
   docs also mention `/workspace` when a slice is in use.  Avoid
   hard-coding the path in the help string; thread it through the
   `makeCommandTool` factory the same way `description` is.

   Done — `makeCommandTool` now accepts an optional
   `sliceWorkspacePath` and `help()` emits a `**Workspace path:**`
   note that names the slice path.  `makeBashTool` / `makeExecTool`
   forward the option, and `buildGenieTools` in
   `src/tools/registry.js` threads it down only when both `spawner`
   and `sliceWorkspacePath` are set (so the dev-repl's `--sandbox
   off` path keeps reusing the pre-built host-spawner exports
   verbatim).

4. [x] Add a regression test that builds a genie agent with a fake
   slice spawner, captures the system-prompt string from
   `piAgent.state`, and asserts the slice path is mentioned exactly
   once when present and absent when not.  Land alongside TODO/61's
   faux-LLM test harness so the assertion can ride the deterministic
   provider rather than driving ollama.

   Done at `packages/genie/test/system/slice-workspace-path.test.js`.
   Eight assertions cover the four layers:
   - `buildSystemPrompt`: slice-path line is present-once-or-absent
     depending on the option.
   - `makePiAgent`: registers an in-process faux provider via
     `registerFauxProvider`, grabs the resulting `Model<…>`, hands it
     into `makePiAgent`, and inspects `piAgent.state.systemPrompt`.
   - `makeGenieAgents`: stub `makeAgent` factory captures every call;
     each receives the slice path when set and omits it when not.
   - `buildGenieTools`: the rebuilt `bash` / `exec` tools' `help()`
     output mentions the slice path; the pre-built tools (no spawner,
     no slice) do not.
   All eight pass under the lockdown, unsafe, and endo SES configs.

5. [ ] Once TODO/60 lands and non-zero exits return as data, audit
   that the agent self-corrects on a "host path is not visible in the
   slice" exit: stderr will say `ls: cannot access '…': No such file
   or directory`, and the model should retry with the slice path.
   Confirm with a faux-LLM scenario that scripts the wrong-path call,
   reads the stderr from the tool result, and emits the right-path
   call on the next turn.

## Acceptance

- A dev-repl run with `--sandbox bwrap` shows the `/workspace` path
  in its system prompt when `-v` dumps the prompt.
- A dev-repl run with `--sandbox off` does not mention `/workspace`.
- The new regression test fails on `main` and passes after the patch.
- Manual smoke: ask `ollama/gemma4` to `ls` the workspace — it
  reaches for `/workspace` rather than the host path.
