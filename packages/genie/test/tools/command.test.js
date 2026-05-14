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

import {
  assertCwdHasNoParentRefs,
  makeBashTool,
  makeCommandTool,
  makeExecTool,
} from '../../src/tools/command.js';

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

// ---------------------------------------------------------------------------
// `assertCwdHasNoParentRefs` — segment-level `..` rejection
// ---------------------------------------------------------------------------
//
// The historical guard rejected any `cwd` containing the substring `..`,
// which over-rejected legitimate filenames whose names merely *include*
// `..` (such as `foo/..bar` — a hidden file named `..bar` inside `foo/`).
// TODO/68 splits the path into segments and rejects only the bare `..`
// segment, while keeping the absolute-path veto on top.

test('assertCwdHasNoParentRefs accepts filenames that contain `..` as a substring', t => {
  // Each of these has a `..` substring but no bare `..` segment.
  t.notThrows(() => assertCwdHasNoParentRefs('foo/..bar'));
  t.notThrows(() => assertCwdHasNoParentRefs('..baz/qux'));
  t.notThrows(() => assertCwdHasNoParentRefs('path..to/file'));
  t.notThrows(() => assertCwdHasNoParentRefs('foo..'));
  t.notThrows(() => assertCwdHasNoParentRefs('..bar.baz'));
});

test('assertCwdHasNoParentRefs accepts ordinary relative paths', t => {
  t.notThrows(() => assertCwdHasNoParentRefs('.'));
  t.notThrows(() => assertCwdHasNoParentRefs('foo'));
  t.notThrows(() => assertCwdHasNoParentRefs('foo/bar'));
  t.notThrows(() => assertCwdHasNoParentRefs('foo/bar/baz'));
  // Empty segments from a doubled separator are filtered out, not
  // rejected — `foo//bar` is harmless after path normalization.
  t.notThrows(() => assertCwdHasNoParentRefs('foo//bar'));
  // The empty string is a degenerate but harmless relative path (no
  // segments, not absolute) — the guard's job is to reject *escapes*,
  // not to validate well-formedness.
  t.notThrows(() => assertCwdHasNoParentRefs(''));
});

test('assertCwdHasNoParentRefs rejects bare `..` segments', t => {
  // The literal bare `..` — the simplest escape.  Pin the exact
  // message so any pre-existing operator-facing diagnostic stays the
  // same.
  t.throws(() => assertCwdHasNoParentRefs('..'), {
    message: 'Invalid path: directory traversal not allowed',
  });
  // A bare `..` as the trailing segment.
  t.throws(() => assertCwdHasNoParentRefs('foo/..'), {
    message: 'Invalid path: directory traversal not allowed',
  });
  // A bare `..` in the middle.
  t.throws(() => assertCwdHasNoParentRefs('foo/../bar'), {
    message: 'Invalid path: directory traversal not allowed',
  });
  // A bare `..` as the leading segment.
  t.throws(() => assertCwdHasNoParentRefs('../foo'), {
    message: 'Invalid path: directory traversal not allowed',
  });
});

test('assertCwdHasNoParentRefs rejects absolute paths with a distinct message', t => {
  t.throws(() => assertCwdHasNoParentRefs('/etc'), {
    message: 'Invalid path: absolute paths not allowed',
  });
  t.throws(() => assertCwdHasNoParentRefs('/etc/passwd'), {
    message: 'Invalid path: absolute paths not allowed',
  });
  t.throws(() => assertCwdHasNoParentRefs('/'), {
    message: 'Invalid path: absolute paths not allowed',
  });
});

// ---------------------------------------------------------------------------
// End-to-end: the path guard fires inside `execute` for `allowPath` tools
// ---------------------------------------------------------------------------

test('makeCommandTool with allowPath rejects a bare `..` cwd via execute', async t => {
  // Build a minimal allowPath-enabled tool so we exercise the guard
  // through the public surface, not just the helper.
  const tool = makeCommandTool({
    name: 'pathy',
    program: 'true',
    allowPath: true,
  });
  await t.throwsAsync(() => tool.execute({ args: [], path: 'foo/../bar' }), {
    message: 'Invalid path: directory traversal not allowed',
  });
});

test('makeCommandTool with allowPath accepts a substring-`..` cwd via execute', async t => {
  if (!isPosix) {
    t.pass('skipped on non-POSIX host');
    return;
  }
  // The pre-fix textual `includes('..')` check would have rejected
  // this even though `..bar` is a perfectly ordinary hidden filename.
  // Using `pwd` lets the call reach the spawner and complete; the
  // working directory itself does not need to exist for the guard
  // test, but pointing it at the current directory keeps the spawner
  // happy.
  const tool = makeCommandTool({
    name: 'pathy',
    program: 'true',
    allowPath: true,
  });
  // The spawner will likely fail to chdir into a non-existent dir,
  // but the guard runs before the spawn, so a *guard* rejection is
  // what we are pinning here: the call must not throw the directory-
  // traversal message.
  const err = await t
    .throwsAsync(() => tool.execute({ args: [], path: 'foo/..bar' }))
    .catch(() => null);
  if (err) {
    t.notRegex(
      err.message,
      /directory traversal not allowed/,
      'substring-`..` cwd must not be vetoed by the traversal guard',
    );
  } else {
    // The spawner succeeded (e.g. `foo/..bar` happened to exist) —
    // that also proves the guard let the call through.
    t.pass();
  }
});
