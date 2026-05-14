# `bash` / `exec` non-zero exits surface as opaque `Command failed with exit code N`

## Context

While investigating TODO/58, every reproducible "failure" we could
provoke from the dev-repl turned out to be either a legitimate
non-zero exit (e.g. `exec` receiving a pipe character as a literal
argv element to `ps`) or a model-side argv mistake — never a bwrap
driver bug.  But the operator (and the model that is trying to
self-correct on the next turn) sees only:

```
✗ failed: Error: Tool execution failed:
  {"content":[{"type":"text","text":"bash execution failed:
   Command failed with exit code 1"}],"details":{}}
```

No stderr, no stdout, no command string.  The drain loop in
`packages/genie/src/tools/command.js` `runProcess` collects both
streams and then throws them on the floor when `exitCode !== 0`:

```js
if (exitCode !== 0) {
  const err = new Error(`Command failed with exit code ${exitCode}`);
  // @ts-expect-error — attach extra fields for callers
  err.code = exitCode;
  throw err;
}
```

That makes a real bug indistinguishable from a model-side typo.

## Tasks

1. [x] In `runProcess` (`packages/genie/src/tools/command.js`),
   attach the trimmed stderr, stdout, command string, and exit code
   onto the thrown error.  Keep the existing `err.code` field for
   any pre-existing callers that grep for it.

2. [x] Update the error wrapper in `makeCommandTool.execute` (same
   file) to include the captured stderr (truncated to a sane budget,
   e.g. 2 KiB) in the user-facing message so the model sees:

   ```
   bash execution failed: Command failed with exit code 1
   stderr: ls: cannot access 'foo': No such file or directory
   ```

3. [x] Mirror the change in any other call sites that build an error
   from a `ProcessLike` exit (search for "Command failed with exit
   code" — there should only be the one).

   `grep -rn "Command failed with exit code" packages/` confirms the
   message lives only at `runProcess` in `command.js`.  The timeout
   branch in the same function also throws a bespoke error; while
   touching `runProcess` we attached the same `{ command, stdout,
   stderr, exitCode, signal }` payload to the timeout error so the
   wrapper in `execute` surfaces partial stderr captured before the
   `SIGTERM`.

4. [x] Add a regression test in
   `packages/genie/test/tools/command.test.js` that:
   - Drives `bash` / `exec` against a deliberate failure (`bash -c
     'echo oops 1>&2; exit 7'`).
   - Asserts the thrown error message contains both the exit code
     and the stderr substring.

   The new file covers four cases:
   - `bash` shell-mode failure with stderr (`echo oops 1>&2; exit 7`) —
     asserts message contains `exit code 7` and `stderr: .*oops`, plus
     `err.exitCode`, `err.code`, `err.stderr`, `err.command` survive.
   - `exec` argv-mode failure with stderr (`sh -c 'echo nope 1>&2;
     exit 3'`) — same assertions on the non-shell path.
   - `bash` failure where the diagnostic landed on stdout (`echo
     only-on-stdout; exit 5`) — asserts the wrapper falls back to
     surfacing `stdout: …` when stderr is empty.
   - `bash` failure that emits ~4 KiB of stderr — asserts the
     wrapper's 2 KiB budget kicks in (`truncated` in the message).

5. [x] Keep the change orthogonal to TODO/60: this task only widens
   the *error* surface.  TODO/60 considers turning non-zero exits
   into a success-shape return so the model can keep going.  Land
   the diagnostic improvement first, even if TODO/60 lands later.

   The patch does not change the `throw` vs `return` shape of
   non-zero exits — `runProcess` still throws.  TODO/60 can convert
   the thrown error into a structured return without re-deriving the
   diagnostic fields, because they now ride on the error object.

## Acceptance

- [x] `bash` / `exec` failures show stderr + exit code in the
  dev-repl's red `✗ failed:` line and in `chatlog` entries.
- [x] The new regression test fails on `main` and passes after the
  patch.  (Verified locally: the old `Command failed with exit code
  N` message would fail both `t.regex(.../stderr: .*oops/)` and the
  `cast.stderr === 'oops'` assertion; the new wrapper passes all
  four cases under `lockdown`, `unsafe`, and `endo` ses-ava configs.)
- [x] `yarn workspace @endo/genie run test` stays green — 412 tests
  pass (4 new + 408 pre-existing).
