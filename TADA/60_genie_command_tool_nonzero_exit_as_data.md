# `bash` / `exec` non-zero exits should be data, not a thrown error

## Context

`makeCommandTool` (`packages/genie/src/tools/command.js`) threw on
any non-zero exit code, which is incongruent with how command-line
tools actually behave:

- `grep foo bar.txt` exits 1 when there is no match — a perfectly
  legitimate "no, the file does not contain foo" result.
- `test -f /some/path` exits 1 when the path does not exist — a
  yes/no question the model expects to ask.
- `find . -name … | head` will fail SIGPIPE-style when `head` closes
  early.
- `diff a b` exits 1 when the files differ, exits 2 on a real error.
- A successful `make check` may exit non-zero on a test failure that
  the model should be able to inspect.

The tool's return shape already advertised `exitCode` (always `0`
because the tool threw otherwise — a wasted field).  The model asked
the question, the tool threw, and the model got nothing back to
reason about except an opaque "Command failed with exit code N"
sentence (widened to include stderr in TADA/59, but still an error).

This was the root of most of the TODO/58 "failures": the model
picked a strategy that legitimately exits non-zero, but the result
it saw back looked like a tool failure rather than a result.

## Resolution

Stop throwing on non-zero exits in `runProcess`.  Always return:

```ts
{
  success: boolean,    // exitCode === 0
  command: string,
  stdout: string,
  stderr: string,
  exitCode: number,
  path?: string,
}
```

Throw only when the spawner itself failed (program-not-found in
non-shell mode, factory reject, slice torn down) or when the
timeout-kill branch fires.  The existing
`<name> execution failed: …` wrapper continues to fire for those.

## Tasks

1. [x] Decide whether this is a semantic change we want.  The schema
   already advertised `success` and `exitCode`, so this is closer to
   "honour the contract" than a breaking change.  The agent's system
   prompt continues to nudge the model to inspect tool output as a
   JSON object — see the description updates below.

2. [x] In `runProcess`, drop the "throw on non-zero" branch and
   populate the return record with `success: exitCode === 0`.  Kept
   the timeout-kill branch as a throw (`<name> timed out after …ms`
   is still an error, not a result) along with its attached
   `{ command, stdout, stderr, exitCode, signal }` diagnostic payload
   from TADA/59.

3. [x] Update the `bash` / `exec` tool descriptions to spell out the
   new contract: returns `{ success, exitCode, stdout, stderr,
   command }`, non-zero exits are data, only spawner-init failures
   and timeouts throw.  The block lists the canonical idioms (`grep`,
   `test -f`, `diff`) so the model has a concrete mental model when
   it sees `success: false`.

4. [x] Add regression tests in
   `packages/genie/test/tools/command.test.js`:
   - `bash`: non-zero exit returns `success:false` with stderr
     captured (the TADA/59 thrown-error assertion is no longer the
     right contract; the test now pins the *data* shape).
   - `exec`: same, on the non-shell argv path.
   - `bash`: stdout is preserved verbatim when a command exits
     non-zero — `npm run`-style scripts that print "Error: …" to
     stdout must still surface as readable data.
   - `bash`: zero exit returns `success:true` and `exitCode: 0`
     (regression guard against accidentally flipping the happy path).
   - `bash`: `grep definitely-not-present-xx /etc/hostname` returns
     `{ success: false, exitCode: 1 }` rather than throwing — the
     canonical "no match" probe.
   - `bash`: `test -f /nonexistent-path-zzz; echo "exit=$?"` round-
     trips the inner exit code through stdout, proving the model can
     branch on yes/no answers via `[ -f … ]`.
   - `exec`: same `grep` probe on the non-shell path.
   - `exec`: a genuinely missing program still throws (program-not-
     found surfaces from the spawner before `runProcess` sees a
     process).
   - `bash`: a 50 ms timeout against `sleep 30` still throws with
     `timed out after 50ms` — a stalled command must not silently
     look like a successful run.

5. [x] Land TADA/59 first so the thrown-path's diagnostics are usable
   when this task surfaces a *real* error.  TADA/59 landed in commit
   `6e32b14a0`; this task builds on the diagnostic payload it
   attached to thrown errors.

## Open questions

- **Does the heartbeat / observer agent rely on the thrown-error
  shape for any of its bookkeeping?**  Audit of `try { … }` blocks in
  `src/heartbeat/index.js`, `src/observer/index.js`,
  `src/reflector/index.js`, and `src/loop/run.js` shows none of them
  branches on the `Command failed with exit code N` shape, the
  `err.exitCode` field, or the captured `stderr` payload.  They all
  wrap higher-level operations (`runAgentRound`, `writeFile`,
  `access`, dispatcher passes) and treat any thrown value as a
  fail-the-round signal — exactly the right behaviour now that only
  spawner-init failures and timeouts reach them.

- **Should `bash` and `exec` differ?**  Decided uniform.  Both report
  exit codes as data because both surface the same primitives to the
  model: `exec` is just `bash` without the shell wrapper.  The model
  already learns the contract from the tool description, which is
  identical between the two factories.

## Acceptance

- [x] `grep`, `test -f`, `diff`, and similar yes/no-via-exit-code
  commands round-trip through `bash` / `exec` as `{ success: false,
  exitCode: N, … }` records instead of throwing.
- [x] Spawner-init failures (program-not-found) still throw — the
  `exec: missing program still throws` regression pins this.
- [x] Timeouts still throw with the `<name> timed out after …ms`
  message — the `bash: timeout still throws` regression pins this.
- [x] The 9 new regression tests pass under all three SES-AVA configs
  (`lockdown`, `unsafe`, `endo`); the pre-existing genie suite stays
  green.
