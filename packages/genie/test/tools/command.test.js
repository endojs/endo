// @ts-check

/**
 * Tests for the `makeCommandTool` / `runProcess` exit-code contract.
 *
 * History:
 *
 * - **TODO/59** widened the error surface so the thrown error carried
 *   `{ stderr, stdout, command, exitCode }` rather than the opaque
 *   `Command failed with exit code N` sentence.
 * - **TODO/60** flipped the contract one step further: non-zero exits
 *   are *data*, not errors.  The tool now returns
 *   `{ success: false, exitCode, stdout, stderr, command }` so the
 *   model can react to legitimate negative results (`grep` exits 1
 *   when there is no match, `test -f` exits 1 when the path is
 *   missing, `diff` exits 1 when files differ).  Only the timeout-
 *   kill branch and spawner-init failures (program-not-found, factory
 *   reject) still throw.
 *
 * The regressions these tests pin:
 *
 * 1. A non-zero exit returns a `{ success: false, exitCode, ... }`
 *    record with `stdout` / `stderr` preserved verbatim.
 * 2. Idiomatic "yes/no" commands like `grep` and `test -f` round-trip
 *    their exit code through the tool rather than throwing.
 * 3. Spawner-init failures (e.g. program-not-found) *do* still throw —
 *    the contract is "non-zero exit is data", not "no command can ever
 *    fail".
 * 4. The timeout-kill branch still throws, so a stalled command does
 *    not silently look like a successful run.
 */

import '@endo/harden';

import process from 'node:process';

import test from 'ava';

import { makeBashTool, makeExecTool } from '../../src/tools/command.js';

const isPosix = process.platform !== 'win32';

// ---------------------------------------------------------------------------
// bash: stderr-bearing non-zero exit
// ---------------------------------------------------------------------------

test('bash: non-zero exit returns success:false with stderr captured', async t => {
  if (!isPosix) {
    t.pass('skipped on non-POSIX host');
    return;
  }
  const bash = makeBashTool();
  const result = await bash.execute({
    args: ['echo oops 1>&2; exit 7'],
  });
  t.is(result.success, false);
  t.is(result.exitCode, 7);
  t.is(result.stderr, 'oops');
  t.is(result.stdout, '');
  t.is(typeof result.command, 'string');
});

// ---------------------------------------------------------------------------
// exec: stderr-bearing non-zero exit (non-shell path)
// ---------------------------------------------------------------------------

test('exec: non-zero exit returns success:false with stderr captured', async t => {
  if (!isPosix) {
    t.pass('skipped on non-POSIX host');
    return;
  }
  const exec = makeExecTool();
  const result = await exec.execute({
    args: ['sh', '-c', 'echo nope 1>&2; exit 3'],
  });
  t.is(result.success, false);
  t.is(result.exitCode, 3);
  t.is(result.stderr, 'nope');
  t.is(result.stdout, '');
});

// ---------------------------------------------------------------------------
// bash: stdout-on-failure is preserved as data
// ---------------------------------------------------------------------------

test('bash: stdout is preserved when a command exits non-zero', async t => {
  if (!isPosix) {
    t.pass('skipped on non-POSIX host');
    return;
  }
  const bash = makeBashTool();
  // Diagnostic on stdout, nothing on stderr — `npm run`-style scripts
  // routinely do this when they print "Error: …" to stdout before
  // exiting non-zero.  The model needs to be able to read it.
  const result = await bash.execute({
    args: ['echo only-on-stdout; exit 5'],
  });
  t.is(result.success, false);
  t.is(result.exitCode, 5);
  t.is(result.stdout, 'only-on-stdout');
  t.is(result.stderr, '');
});

// ---------------------------------------------------------------------------
// Successful exit still produces success:true / exitCode:0
// ---------------------------------------------------------------------------

test('bash: zero exit returns success:true and exitCode 0', async t => {
  if (!isPosix) {
    t.pass('skipped on non-POSIX host');
    return;
  }
  const bash = makeBashTool();
  const result = await bash.execute({ args: ['echo hello'] });
  t.is(result.success, true);
  t.is(result.exitCode, 0);
  t.is(result.stdout, 'hello');
  t.is(result.stderr, '');
});

// ---------------------------------------------------------------------------
// Idiomatic yes/no commands round-trip their exit code as data
// ---------------------------------------------------------------------------

test('bash: `grep` with no match reports non-zero exitCode as data', async t => {
  if (!isPosix) {
    t.pass('skipped on non-POSIX host');
    return;
  }
  const bash = makeBashTool();
  // /etc/hostname exists on every POSIX host the CI runs on, and the
  // probability of the literal string "definitely-not-present-xx"
  // appearing in it is effectively zero.
  const result = await bash.execute({
    args: ['grep definitely-not-present-xx /etc/hostname'],
  });
  // The point of TODO/60 is that this *must not throw* — the model
  // needs to see "no match" as a result it can branch on.
  t.is(result.success, false);
  t.not(result.exitCode, 0);
  t.is(result.stdout, '');
});

test('bash: `test -f` on a missing path reports exitCode 1 via stdout', async t => {
  if (!isPosix) {
    t.pass('skipped on non-POSIX host');
    return;
  }
  const bash = makeBashTool();
  // `test` is a shell builtin; `[ -f /path ]` is the canonical
  // yes/no-via-exit-code probe.
  const result = await bash.execute({
    args: ['test -f /nonexistent-path-zzz; echo "exit=$?"'],
  });
  // The trailing `echo` runs after `test`, so the overall script
  // succeeds — but the captured stdout proves the inner exit code
  // routed through correctly.
  t.is(result.success, true);
  t.is(result.exitCode, 0);
  t.is(result.stdout, 'exit=1');
});

test('exec: `grep` with no match reports non-zero exitCode as data', async t => {
  if (!isPosix) {
    t.pass('skipped on non-POSIX host');
    return;
  }
  const exec = makeExecTool();
  const result = await exec.execute({
    args: ['grep', 'definitely-not-present-xx', '/etc/hostname'],
  });
  t.is(result.success, false);
  t.not(result.exitCode, 0);
  t.is(result.stdout, '');
});

// ---------------------------------------------------------------------------
// Spawner-init failures still throw
// ---------------------------------------------------------------------------

test('exec: missing program still throws (program-not-found)', async t => {
  if (!isPosix) {
    t.pass('skipped on non-POSIX host');
    return;
  }
  const exec = makeExecTool();
  // The non-shell path resolves argv[0] against $PATH before fork,
  // so a missing program surfaces as a spawner-init error rather than
  // a non-zero exit.  That *must* still throw — there is no process
  // to attach a result record to.
  await t.throwsAsync(
    () => exec.execute({ args: ['definitely-not-a-real-binary-mp1sx0xx'] }),
    { message: /command not found/ },
  );
});

// ---------------------------------------------------------------------------
// Timeout still throws
// ---------------------------------------------------------------------------

test('bash: timeout still throws and surfaces the timeout message', async t => {
  if (!isPosix) {
    t.pass('skipped on non-POSIX host');
    return;
  }
  const bash = makeBashTool();
  // 50 ms budget against a 30-second sleep — the timer fires and the
  // process is killed with SIGTERM.  The result is *not* data: the
  // command did not get to run to completion.
  await t.throwsAsync(
    () =>
      bash.execute({
        args: ['sleep 30'],
        timeout_ms: 50,
      }),
    { message: /timed out after 50ms/ },
  );
});
