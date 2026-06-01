// @ts-check
/// <reference types="ses"/>

import test from '@endo/ses-ava/prepare-endo.js';

import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify as nodePromisify } from 'node:util';

import { E, Far } from '@endo/far';

import { makeFilePowers } from '../src/daemon-node-powers.js';
import { lineageOf, makeMount } from '../src/mount.js';
import { makeReaderRef } from '../src/reader-ref.js';
import {
  makeGit,
  makeNotYetImplementedBackend,
  makeNativeGitBackend,
  internalHelpers,
} from '@endo/endo-git';

const execFileAsync = nodePromisify(execFile);

/**
 * Initialize a real git repository at a tmp path with an initial
 * commit on `main`.  Returns the host path; the caller is responsible
 * for adding the AVA teardown.
 *
 * @param {import('ava').ExecutionContext} t
 */
const provisionGitWorktree = async t => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'native-git-'));
  t.teardown(() => fs.promises.rm(root, { recursive: true, force: true }));
  await execFileAsync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  // Some CI / dev environments enable `commit.gpgSign` at user-global
  // level; that surfaces here because `provisionGitWorktree` does not
  // override gpg config per-invocation.  Pin the repo-local config to
  // disable signing so the test setup is independent of the user's
  // environment.
  await execFileAsync('git', ['config', '--local', 'commit.gpgsign', 'false'], {
    cwd: root,
  });
  await execFileAsync('git', ['config', '--local', 'tag.gpgsign', 'false'], {
    cwd: root,
  });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=T',
      'commit',
      '--allow-empty',
      '-m',
      'init commit',
    ],
    { cwd: root },
  );
  return root;
};

/**
 * @param {import('ava').ExecutionContext} t
 */
const provisionMount = async t => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'git-test-'));
  t.teardown(() => fs.promises.rm(root, { recursive: true, force: true }));
  const filePowers = makeFilePowers({ fs, path });
  return makeMount({ rootPath: root, readOnly: false, filePowers });
};

test('Git exo advertises the full GitInterface', async t => {
  const mount = await provisionMount(t);
  const git = makeGit({ mount, backend: makeNotYetImplementedBackend() , lineageOf });

  // `makeExo` adds the introspection method, but it is intentionally
  // omitted from the public `EndoGit` interface.  Cast at the call site.
  // eslint-disable-next-line no-underscore-dangle
  const methods = await E(/** @type {any} */ (git)).__getMethodNames__();

  // Inspection
  for (const name of ['status', 'diff', 'log', 'show', 'revParse']) {
    t.true(methods.includes(name), `Git should advertise ${name}`);
  }

  // Mutation
  for (const name of ['add', 'restore', 'commit']) {
    t.true(methods.includes(name), `Git should advertise ${name}`);
  }

  // Branching
  for (const name of [
    'currentBranch',
    'branches',
    'createBranch',
    'deleteBranch',
    'renameBranch',
    'switchBranch',
    'detach',
    'switch',
  ]) {
    t.true(methods.includes(name), `Git should advertise ${name}`);
  }

  // Integration
  for (const name of ['merge', 'rebase']) {
    t.true(methods.includes(name), `Git should advertise ${name}`);
  }

  // Stash
  for (const name of [
    'stashPush',
    'stashList',
    'stashShow',
    'stashApply',
    'stashPop',
    'stashDrop',
  ]) {
    t.true(methods.includes(name), `Git should advertise ${name}`);
  }

  // Trees + worktree binding
  t.true(methods.includes('tree'));
  t.true(methods.includes('filesystemAt'));
  t.true(methods.includes('worktree'));
  t.true(methods.includes('readOnly'));
});

test('Git.worktree() returns the bound mount cap', async t => {
  const mount = await provisionMount(t);
  const git = makeGit({ mount, backend: makeNotYetImplementedBackend() , lineageOf });

  // Same identity (passes through, no wrapping).  The mount cap stays
  // the public worktree authority for any guest that holds the Git cap.
  t.is(await E(git).worktree(), mount);
});

test('Git.readOnly() attenuates mutating operations but preserves reads', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.writeFile(path.join(repoRoot, 'new.txt'), 'new');
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });

  const readOnlyGit = await E(git).readOnly();
  t.is(await E(readOnlyGit).worktree(), mount);

  const entries = await E(readOnlyGit).status();
  t.is(entries.length, 1);
  t.is(entries[0].path, 'new.txt');

  const entry = await E(mount).entry(['new.txt']);
  await t.throwsAsync(E(readOnlyGit).add([entry]), {
    message: /read-only Git capability/,
  });
  await t.throwsAsync(E(readOnlyGit).commit('should fail'), {
    message: /read-only Git capability/,
  });
  await t.throwsAsync(E(readOnlyGit).switchBranch('main'), {
    message: /read-only Git capability/,
  });

  t.is(await E(readOnlyGit).readOnly(), readOnlyGit);
});

test('makeGit can be constructed directly as read-only', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.writeFile(path.join(repoRoot, 'blocked.txt'), 'x');
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: true, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend, readOnly: true , lineageOf });

  t.is((await E(git).status()).length, 1);
  const entry = await E(mount).entry(['blocked.txt']);
  await t.throwsAsync(E(git).add([entry]), {
    message: /read-only Git capability/,
  });
});

test('NativeGitBackend.tree exposes historical blobs and subtrees', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.mkdir(path.join(repoRoot, 'src'), { recursive: true });
  await fs.promises.writeFile(path.join(repoRoot, 'README.md'), 'old\n');
  await fs.promises.writeFile(
    path.join(repoRoot, 'src', 'config.json'),
    '{"ok":true}\n',
  );
  await execFileAsync('git', ['add', 'README.md', 'src/config.json'], {
    cwd: repoRoot,
  });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=T',
      'commit',
      '-m',
      'add tree files',
    ],
    { cwd: repoRoot },
  );
  await fs.promises.writeFile(path.join(repoRoot, 'README.md'), 'new\n');

  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const tree = /** @type {any} */ (await backend.tree('HEAD'));

  t.deepEqual(await E(tree).list(), ['README.md', 'src']);
  t.true(await E(tree).has('README.md'));
  t.true(await E(tree).has('src', 'config.json'));
  t.false(await E(tree).has('src', 'missing.json'));

  const readme = await E(tree).lookup('README.md');
  t.is(await E(readme).text(), 'old\n');

  const reader = await E(readme).streamBase64();
  const chunk = await E(reader).next();
  t.false(chunk.done);
  t.is(Buffer.from(chunk.value, 'base64').toString('utf8'), 'old\n');

  const src = await E(tree).lookup('src');
  t.deepEqual(await E(src).list(), ['config.json']);
  const config = await E(tree).lookup(['src', 'config.json']);
  t.deepEqual(await E(config).json(), { ok: true });
});

test('NativeGitBackend.tree streams blobs larger than the exec buffer cap', async t => {
  const repoRoot = await provisionGitWorktree(t);
  const size = internalHelpers.GIT_MAX_BUFFER + 8192;
  await fs.promises.writeFile(
    path.join(repoRoot, 'large.bin'),
    Buffer.alloc(size, 7),
  );
  await execFileAsync('git', ['add', 'large.bin'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=T',
      'commit',
      '-m',
      'add large blob',
    ],
    { cwd: repoRoot },
  );

  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const tree = /** @type {any} */ (await backend.tree('HEAD'));
  const blob = await E(tree).lookup('large.bin');
  const reader = await E(blob).streamBase64();

  let bytesRead = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const chunk = await E(reader).next();
    if (chunk.done) {
      break;
    }
    bytesRead += Buffer.from(chunk.value, 'base64').byteLength;
  }
  t.is(bytesRead, size);
});

test('Git.readOnly allows immutable tree reads', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.writeFile(path.join(repoRoot, 'audit.txt'), 'audit\n');
  await execFileAsync('git', ['add', 'audit.txt'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=T',
      'commit',
      '-m',
      'add audit file',
    ],
    { cwd: repoRoot },
  );
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });

  const readOnlyGit = await E(git).readOnly();
  const tree = /** @type {any} */ (await E(readOnlyGit).tree('HEAD'));
  const blob = await E(tree).lookup('audit.txt');
  t.is(await E(blob).text(), 'audit\n');
});

test('Git scaffold methods all surface a clear "not yet implemented"', async t => {
  const mount = await provisionMount(t);
  const backend = makeNotYetImplementedBackend();
  const git = makeGit({ mount, backend , lineageOf });

  // A representative sample across category boundaries; the stub backend
  // throws for every op except the formula-instantiation-time
  // assertRepositoryRoot, which is only called by `provideGit`.
  await t.throwsAsync(E(git).status(), { message: /not yet implemented/ });
  await t.throwsAsync(E(git).log({}), { message: /not yet implemented/ });
  await t.throwsAsync(E(git).commit('msg'), {
    message: /not yet implemented/,
  });
  await t.throwsAsync(E(git).branches(), { message: /not yet implemented/ });
  await t.throwsAsync(E(git).tree('HEAD'), {
    message: /not yet implemented/,
  });
  await t.throwsAsync(E(git).filesystemAt('HEAD'), {
    message: /not yet implemented/,
  });

  // The remote-transport methods are not on the Git exo; they are
  // called by GitRemote directly against the backend.  The stub
  // backend reports the same not-yet-implemented error so a remote
  // mounted against an under-development backend fails closed rather
  // than appearing to fetch / push silently.
  await t.throwsAsync(backend.remoteFetch({}), {
    message: /not yet implemented/,
  });
  await t.throwsAsync(backend.remotePush({}), {
    message: /not yet implemented/,
  });

  // add/restore reject fabricated entries at the lineage check.  The
  // backend never sees a path because the public exo refuses before
  // dispatching.  ("not yet implemented" reaches the backend's own
  // methods that the public exo dispatches to directly, like status.)
  // The fake intentionally lacks `displayPath` / `child`; cast through
  // the EndoMountEntry shape so the boundary type is satisfied at
  // call-site even though the runtime guard is what fires.
  const fakeEntry = /** @type {import('../src/types.js').EndoMountEntry} */ (
    /** @type {unknown} */ (Far('FakeEntry', { segments: () => ['foo.txt'] }))
  );
  await t.throwsAsync(E(git).add([fakeEntry]), {
    message: /not an EndoMountEntry/,
  });
});

test('NativeGitBackend.assertRepositoryRoot accepts an exact worktree root', async t => {
  const repoRoot = await provisionGitWorktree(t);
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  await t.notThrowsAsync(backend.assertRepositoryRoot());
});

test('NativeGitBackend.assertRepositoryRoot rejects a non-worktree directory', async t => {
  const bare = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'native-git-bare-'),
  );
  t.teardown(() => fs.promises.rm(bare, { recursive: true, force: true }));
  const backend = makeNativeGitBackend({ repoRoot: bare , makeReaderRef });
  // No `.git` here, so `git rev-parse --show-toplevel` errors out and
  // the backend surfaces a structured failure rather than silently
  // operating against the user's surrounding repository.
  await t.throwsAsync(backend.assertRepositoryRoot(), {
    message: /not a git repository|repository root|rev-parse failed/i,
  });
});

test('NativeGitBackend rejects a swapped .git directory after construction', async t => {
  const repoRoot = await provisionGitWorktree(t);
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  await backend.assertRepositoryRoot();
  t.truthy(await backend.currentBranch());

  await fs.promises.rm(path.join(repoRoot, '.git'), {
    recursive: true,
    force: true,
  });
  await execFileAsync('git', ['init', '-q', '-b', 'main'], { cwd: repoRoot });
  await execFileAsync('git', ['config', '--local', 'commit.gpgsign', 'false'], {
    cwd: repoRoot,
  });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=T',
      'commit',
      '--allow-empty',
      '-m',
      'replacement root',
    ],
    { cwd: repoRoot },
  );

  await t.throwsAsync(backend.status(), {
    message: /repository identity changed/,
  });
});

test('NativeGitBackend.currentBranch returns the symbolic ref name', async t => {
  const repoRoot = await provisionGitWorktree(t);
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const head = await backend.currentBranch();
  t.deepEqual(head, { name: 'main', kind: 'branch' });
});

test('NativeGitBackend.branches lists the local branches', async t => {
  const repoRoot = await provisionGitWorktree(t);
  // Add a second branch so `branches()` returns more than one row.
  await execFileAsync('git', ['branch', 'feature/x'], { cwd: repoRoot });

  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const refs = await backend.branches();
  const names = refs.map(r => r.name).sort();
  t.deepEqual(names, ['feature/x', 'main']);
  // All entries report kind 'branch'.
  for (const ref of refs) {
    t.is(ref.kind, 'branch');
  }
});

test('NativeGitBackend.revParse returns the resolved commit id', async t => {
  const repoRoot = await provisionGitWorktree(t);
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });

  const head = await backend.revParse('HEAD');
  t.is(head.kind, 'commit');
  // 40-char SHA-1; future SHA-256 repos extend to 64.
  t.regex(head.oid || '', /^[0-9a-f]{40,64}$/);
  // The `name` echoes the input so callers can correlate.
  t.is(head.name, 'HEAD');
});

test('NativeGitBackend.log returns structured commit records', async t => {
  const repoRoot = await provisionGitWorktree(t);
  // Add a second commit so log has something to enumerate.
  await fs.promises.writeFile(path.join(repoRoot, 'a.txt'), 'a');
  await execFileAsync('git', ['add', 'a.txt'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=T', 'commit', '-m', 'add a.txt'],
    { cwd: repoRoot },
  );

  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const commits = await backend.log({ maxCount: 5 });
  t.is(commits.length, 2);
  // Most-recent-first ordering matches `git log`'s default.
  t.is(commits[0].summary, 'add a.txt');
  t.is(commits[1].summary, 'init commit');
  for (const commit of commits) {
    t.regex(commit.oid, /^[0-9a-f]{40,64}$/);
    t.is(commit.author, 'T');
    t.is(typeof commit.committedAt, 'number');
  }
});

test('NativeGitBackend.log honors since / until time-window options', async t => {
  const repoRoot = await provisionGitWorktree(t);
  // Backdate the initial commit so the `since` filter has a window to
  // exclude.  Override the committer date so git log --since sees an
  // unambiguous old commit.
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=T',
      'commit',
      '--allow-empty',
      '--date=2020-01-01T00:00:00Z',
      '-m',
      'old commit',
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
      },
    },
  );
  // And a recent commit so `since` includes at least one row.
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=T',
      'commit',
      '--allow-empty',
      '-m',
      'recent commit',
    ],
    { cwd: repoRoot },
  );

  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });

  // `since` is a forward-cut: 2024-01-01 excludes the 2020 commit.
  const recent = await backend.log({ since: '2024-01-01' });
  const recentSummaries = recent.map(c => c.summary);
  t.true(
    recentSummaries.includes('recent commit'),
    'recent commit should pass the since filter',
  );
  t.false(
    recentSummaries.includes('old commit'),
    'old commit should be filtered out by since=2024-01-01',
  );

  // `until` is a backward-cut: until=2020-12-31 keeps only the 2020 commit.
  const old = await backend.log({ until: '2020-12-31' });
  const oldSummaries = old.map(c => c.summary);
  t.true(
    oldSummaries.includes('old commit'),
    'old commit should pass the until filter',
  );
  t.false(
    oldSummaries.includes('recent commit'),
    'recent commit should be filtered out by until=2020-12-31',
  );

  // Defense at the boundary: empty-string since/until is rejected so a
  // mistakenly empty filter does not turn into `--since=` (git accepts
  // it but it is almost certainly a caller bug).
  await t.throwsAsync(backend.log({ since: '' }), {
    message: /log\.since is required/,
  });
  await t.throwsAsync(backend.log({ until: '' }), {
    message: /log\.until is required/,
  });
});

test('NativeGitBackend.log rejects non-positive or non-integer maxCount', async t => {
  // Documents the boundary `--max-count` validation: maxCount must be a
  // positive integer.  Without this rejection, a caller passing 0 or
  // -1 would result in `--max-count=0` (which git accepts but returns
  // nothing) or `--max-count=-1` (which git rejects with a less helpful
  // surface).  A non-integer value (1.5) would coerce to a malformed
  // flag value that git rejects on its own, but the boundary check
  // fails closed at the daemon edge so the caller learns the right
  // diagnosis.
  const repoRoot = await provisionGitWorktree(t);
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });

  await t.throwsAsync(backend.log({ maxCount: 0 }), {
    message: /log\.maxCount must be a positive integer/,
  });
  await t.throwsAsync(backend.log({ maxCount: -1 }), {
    message: /log\.maxCount must be a positive integer/,
  });
  await t.throwsAsync(backend.log({ maxCount: 1.5 }), {
    message: /log\.maxCount must be a positive integer/,
  });

  // Happy-path positive integer still works so the rejection branch is
  // distinguishable from a blanket "any maxCount throws" regression.
  const ok = await backend.log({ maxCount: 1 });
  t.is(ok.length, 1);
});

test('NativeGitBackend.log since / until use the flag form so dash-prefixed values do not inject', async t => {
  // The commit that added since/until (68ea8394e) committed to the
  // `--since=<value>` flag form specifically so a value starting with
  // `-` stays in a single argv slot and cannot be interpreted by git
  // as a separate option.  Verify by passing a value that git would
  // diagnose as a flag if it were split across two argv positions
  // (`--since`, `-no-walk`): git surfaces "did you mean `--no-walk`"
  // in that case, while the joined form `--since=-no-walk` is accepted
  // as an opaque approxidate that matches no commits.
  //
  // This regresses the boundary even though git's own behavior is what
  // distinguishes the two argv layouts; the daemon's job is to build
  // the joined argv, and a future refactor that switches back to the
  // split form would fail this test before it could ship.
  const repoRoot = await provisionGitWorktree(t);
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });

  // A dash-prefixed approxidate stays an opaque value when joined with
  // `=`; git resolves it (badly) and returns an empty filter set rather
  // than failing with a "did you mean" diagnosis.
  const since = await backend.log({ since: '-no-walk' });
  t.true(
    Array.isArray(since),
    'since with a dash-prefixed value resolves to an array',
  );

  const until = await backend.log({ until: '-no-walk' });
  t.true(
    Array.isArray(until),
    'until with a dash-prefixed value resolves to an array',
  );
});

test('NativeGitBackend.show returns the commit text', async t => {
  const repoRoot = await provisionGitWorktree(t);
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const text = await backend.show('HEAD');
  t.regex(text, /init commit/);
});

test('NativeGitBackend.revParse rejects revisions starting with "-"', async t => {
  const repoRoot = await provisionGitWorktree(t);
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  // Defends against argument-injection via a revision that looks like
  // a flag.  The public exo's interface guard rejects non-strings, but
  // a string starting with `-` could otherwise become `git rev-parse
  // --verify -delete-foo`.
  await t.throwsAsync(backend.revParse('-delete'), {
    message: /must not start with "-"/,
  });
});

test('NativeGitBackend.truncateOutput surfaces the visibility marker', t => {
  const { truncateOutput, TOOL_OUTPUT_LIMIT } = internalHelpers;

  // Under-budget output is returned verbatim so callers see the full
  // text when it fits.
  const short = 'a'.repeat(TOOL_OUTPUT_LIMIT);
  t.is(truncateOutput(short), short);
  t.notRegex(truncateOutput(short), /truncated|chars total/);

  // Output that exceeds the budget is truncated to the budget and a
  // visibility marker that names the original length is appended, so a
  // caller (or an LLM reading the log line) can tell the diff was cut.
  const oversized = 'a'.repeat(TOOL_OUTPUT_LIMIT + 1234);
  const result = truncateOutput(oversized);
  t.true(result.length > TOOL_OUTPUT_LIMIT);
  t.regex(result, /\.\.\. \(truncated, \d+ chars total\)$/);
  // The reported total is the pre-truncation length, not the truncated
  // length, so a reader can size the gap.
  t.regex(result, new RegExp(`chars total\\)$`));
  t.true(result.includes(`${TOOL_OUTPUT_LIMIT + 1234} chars total`));
});

test('NativeGitBackend version parser enforces the documented git floor', t => {
  const { parseGitVersion, compareVersion, assertSupportedGitVersion } =
    internalHelpers;

  t.deepEqual(
    parseGitVersion('git version 2.39.5 (Apple Git-154)'),
    [2, 39, 5],
  );
  t.deepEqual(parseGitVersion('git version 2.30'), [2, 30, 0]);
  t.true(compareVersion([2, 30, 0], [2, 30, 0]) === 0);
  t.true(compareVersion([2, 31, 0], [2, 30, 0]) > 0);
  t.true(compareVersion([2, 29, 9], [2, 30, 0]) < 0);
  t.notThrows(() => assertSupportedGitVersion('git version 2.30.0'));
  t.throws(() => assertSupportedGitVersion('git version 2.29.9'), {
    message: /requires git >= 2\.30\.0/,
  });
});

test('NativeGitBackend credential transport satisfies git HTTP auth challenge', async t => {
  const repoRoot = await provisionGitWorktree(t);
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  /** @type {string[]} */
  const authorizations = [];
  const server = http.createServer((req, res) => {
    const authorization = req.headers.authorization;
    if (authorization !== undefined) {
      authorizations.push(authorization);
      res.writeHead(404);
      res.end('not a git repository');
      return;
    }
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Endo Git Test"',
    });
    res.end('auth required');
  });
  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  const address = /** @type {import('node:net').AddressInfo} */ (
    server.address()
  );
  try {
    await t.throwsAsync(
      backend.remoteFetch({
        url: `http://127.0.0.1:${address.port}/repo.git`,
        refspecs: [],
        credential: harden({
          kind: 'bearer',
          material: harden({ token: 'test-token' }),
        }),
      }),
      { message: /git fetch failed/ },
    );
  } finally {
    await new Promise(resolve => {
      server.close(() => resolve(undefined));
    });
  }

  const expected = `Basic ${Buffer.from('x-access-token:test-token').toString(
    'base64',
  )}`;
  t.true(authorizations.includes(expected));
});

test('NativeGitBackend.remoteFetch rejects repo-local URL rewrites', async t => {
  const sourceRepo = await provisionGitWorktree(t);
  const remoteParent = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'native-git-remote-'),
  );
  t.teardown(() =>
    fs.promises.rm(remoteParent, { recursive: true, force: true }),
  );
  const remoteRoot = path.join(remoteParent, 'remote.git');
  await execFileAsync('git', ['clone', '--bare', sourceRepo, remoteRoot]);

  const repoRoot = await provisionGitWorktree(t);
  await execFileAsync(
    'git',
    [
      'config',
      `url.file://${remoteRoot}.insteadOf`,
      'https://trusted.example/repo',
    ],
    { cwd: repoRoot },
  );

  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  await t.throwsAsync(
    backend.remoteFetch({
      url: 'https://trusted.example/repo',
      refspecs: ['refs/heads/main:refs/remotes/origin/main'],
    }),
    { message: /repository config can alter remote transport.*url\./ },
  );
});

test('NativeGitBackend.diff returns worktree changes by default', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.writeFile(path.join(repoRoot, 'a.txt'), 'v1');
  await execFileAsync('git', ['add', 'a.txt'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=T', 'commit', '-m', 'add a'],
    { cwd: repoRoot },
  );
  await fs.promises.writeFile(path.join(repoRoot, 'a.txt'), 'v2\n');

  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const out = await backend.diff({});
  t.regex(out, /diff --git/);
  t.regex(out, /-v1/);
  t.regex(out, /\+v2/);
});

test('NativeGitBackend.diff with --cached and a path filter', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.writeFile(path.join(repoRoot, 'staged.txt'), 'staged');
  await fs.promises.writeFile(path.join(repoRoot, 'unstaged.txt'), 'unstaged');
  await execFileAsync('git', ['add', 'staged.txt'], { cwd: repoRoot });

  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const out = await backend.diff({ cached: true, paths: ['staged.txt'] });
  // Cached diff sees the staged file only.
  t.regex(out, /staged\.txt/);
  t.notRegex(out, /unstaged\.txt/);
});

test('NativeGitBackend branch ops: create, list, rename, switch, detach, delete', async t => {
  const repoRoot = await provisionGitWorktree(t);
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });

  // Create from current HEAD; result reports the new ref.
  const created = await backend.createBranch('feature/initial', {});
  t.deepEqual(created, { name: 'feature/initial', kind: 'branch' });

  // Listing sees the new branch alongside main.
  const branches1 = await backend.branches();
  t.deepEqual(branches1.map(r => r.name).sort(), ['feature/initial', 'main']);

  // Switch then rename: the current branch should change too.
  await backend.switchBranch('feature/initial');
  await backend.renameBranch('feature/initial', 'feature/renamed');
  const current = await backend.currentBranch();
  t.deepEqual(current, { name: 'feature/renamed', kind: 'branch' });

  await backend.detach('HEAD');
  t.is(await backend.currentBranch(), undefined);

  // Delete: must switch away first because you cannot delete the
  // current branch.
  await backend.switchBranch('main');
  await backend.deleteBranch('feature/renamed', {});
  const branches2 = await backend.branches();
  t.deepEqual(branches2.map(r => r.name).sort(), ['main']);
});

test('NativeGitBackend.createBranch with startPoint and switchAfterCreate', async t => {
  const repoRoot = await provisionGitWorktree(t);
  // Add a second commit so a distinct startPoint is meaningful.
  await fs.promises.writeFile(path.join(repoRoot, 'x.txt'), 'x');
  await execFileAsync('git', ['add', 'x.txt'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=T', 'commit', '-m', 'add x'],
    { cwd: repoRoot },
  );
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const startPoint = (await backend.revParse('HEAD~1')).oid || '';

  await backend.createBranch('past', {
    startPoint,
    switchAfterCreate: true,
  });
  const current = await backend.currentBranch();
  t.is(current && current.name, 'past');
  // The startPoint commit is now HEAD.
  const head = await backend.revParse('HEAD');
  t.is(head.oid, startPoint);
});

test('NativeGitBackend.merge fast-forwards a local branch', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await execFileAsync('git', ['switch', '-c', 'feature'], { cwd: repoRoot });
  await fs.promises.writeFile(path.join(repoRoot, 'feature.txt'), 'feature\n');
  await execFileAsync('git', ['add', 'feature.txt'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=T',
      'commit',
      '-m',
      'feature commit',
    ],
    { cwd: repoRoot },
  );
  await execFileAsync('git', ['switch', 'main'], { cwd: repoRoot });

  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const result = await backend.merge('feature', {});
  t.regex(result, /Fast-forward|Updating/);
  t.is(
    await fs.promises.readFile(path.join(repoRoot, 'feature.txt'), 'utf8'),
    'feature\n',
  );
});

test('NativeGitBackend.rebase rebases a local branch onto upstream', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.writeFile(path.join(repoRoot, 'base.txt'), 'base\n');
  await execFileAsync('git', ['add', 'base.txt'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=T',
      'commit',
      '-m',
      'base commit',
    ],
    { cwd: repoRoot },
  );
  await execFileAsync('git', ['switch', '-c', 'feature'], { cwd: repoRoot });
  await fs.promises.writeFile(path.join(repoRoot, 'feature.txt'), 'feature\n');
  await execFileAsync('git', ['add', 'feature.txt'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=T',
      'commit',
      '-m',
      'feature commit',
    ],
    { cwd: repoRoot },
  );
  await execFileAsync('git', ['switch', 'main'], { cwd: repoRoot });
  await fs.promises.writeFile(path.join(repoRoot, 'main.txt'), 'main\n');
  await execFileAsync('git', ['add', 'main.txt'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=T',
      'commit',
      '-m',
      'main commit',
    ],
    { cwd: repoRoot },
  );
  await execFileAsync('git', ['switch', 'feature'], { cwd: repoRoot });

  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  await backend.rebase({ mode: 'start', upstream: 'main' });
  const commits = await backend.log({ maxCount: 2 });
  t.deepEqual(
    commits.map(commit => commit.summary),
    ['feature commit', 'main commit'],
  );
});

test('Git stash methods preserve path authority through EndoMountEntry', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.writeFile(path.join(repoRoot, 'tracked.txt'), 'before\n');
  await execFileAsync('git', ['add', 'tracked.txt'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=T', 'commit', '-m', 'track file'],
    { cwd: repoRoot },
  );

  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });

  await fs.promises.writeFile(path.join(repoRoot, 'tracked.txt'), 'after\n');
  const entry = await E(mount).entry(['tracked.txt']);
  const result = await E(git).stashPush({
    message: 'save tracked',
    entries: [entry],
  });
  t.regex(result, /Saved working directory/);
  t.is(
    await fs.promises.readFile(path.join(repoRoot, 'tracked.txt'), 'utf8'),
    'before\n',
  );

  const stashes = await E(git).stashList();
  t.true(stashes[0].includes('save tracked'));
  const patch = await E(git).stashShow(0);
  t.true(patch.includes('+after'));

  await E(git).stashApply(0);
  t.is(
    await fs.promises.readFile(path.join(repoRoot, 'tracked.txt'), 'utf8'),
    'after\n',
  );
  await E(git).stashDrop(0);
  t.deepEqual(await E(git).stashList(), []);
});

test('Git.diff routes EndoMountEntry inputs through the lineage gate', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.writeFile(path.join(repoRoot, 'tracked.txt'), 'v1');
  await execFileAsync('git', ['add', 'tracked.txt'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=T', 'commit', '-m', 'add t'],
    { cwd: repoRoot },
  );
  await fs.promises.writeFile(path.join(repoRoot, 'tracked.txt'), 'v2\n');

  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });

  const entry = await E(mount).entry(['tracked.txt']);
  const out = await E(git).diff({ entries: [entry] });
  t.regex(out, /tracked\.txt/);
});

test('NativeGitBackend.add stages files via repo-relative paths', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.writeFile(path.join(repoRoot, 'new.txt'), 'fresh');
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });

  await backend.add(['new.txt']);

  const entries = await backend.status();
  const [row] = entries;
  t.is(row.path, 'new.txt');
  t.is(row.index, 'added');
});

test('NativeGitBackend.add rejects empty / non-string paths', async t => {
  const repoRoot = await provisionGitWorktree(t);
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });

  await t.throwsAsync(backend.add([]), { message: /non-empty array/ });
  await t.throwsAsync(backend.add(['']), { message: /is required/ });
  await t.throwsAsync(backend.add(['has\0null']), { message: /NUL bytes/ });
});

test('NativeGitBackend.commit produces a new HEAD with the given message', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.writeFile(path.join(repoRoot, 'a.txt'), 'a');
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  await backend.add(['a.txt']);

  const commit = await backend.commit('add a.txt');

  t.regex(commit.oid, /^[0-9a-f]{40,64}$/);
  t.is(commit.summary, 'add a.txt');
  t.is(commit.author, 'Endo');
  t.is(typeof commit.committedAt, 'number');

  // log -1 should now report the new commit.
  const recent = await backend.log({ maxCount: 1 });
  t.is(recent[0].oid, commit.oid);
});

test('NativeGitBackend.restore --staged unstages an added file', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.writeFile(path.join(repoRoot, 'staged.txt'), 'x');
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  await backend.add(['staged.txt']);

  // Index should now show the add.
  let entries = await backend.status();
  t.is(entries[0].index, 'added');

  // Unstage; the file should drop back to untracked.
  await backend.restore(['staged.txt'], { staged: true });
  entries = await backend.status();
  t.is(entries[0].worktree, 'untracked');
});

test('Git.add wraps EndoMountEntry inputs and refuses cross-mount entries', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.writeFile(path.join(repoRoot, 'sample.txt'), 'sample');
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });

  // Same-lineage entry: add works through the public Git exo and the
  // backend sees the resolved repo-relative path.
  const ownEntry = await E(mount).entry(['sample.txt']);
  await E(git).add([ownEntry]);
  const entries = await backend.status();
  t.is(entries[0].path, 'sample.txt');
  t.is(entries[0].index, 'added');

  // Cross-mount entry: a separate mount lineage's entry is rejected
  // before the backend sees anything.
  const otherRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'cross-git-'),
  );
  t.teardown(() => fs.promises.rm(otherRoot, { recursive: true, force: true }));
  const otherMount = makeMount({
    rootPath: otherRoot,
    readOnly: false,
    filePowers,
  });
  const otherEntry = await E(otherMount).entry(['x.txt']);
  await t.throwsAsync(E(git).add([otherEntry]), {
    message: /different mount lineage/,
  });
});

test('Git.commit through the public exo returns a structured commit record', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.writeFile(path.join(repoRoot, 'b.txt'), 'b');
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });

  const entry = await E(mount).entry(['b.txt']);
  await E(git).add([entry]);
  const commit = await E(git).commit('add b.txt');

  t.is(commit.summary, 'add b.txt');
  t.regex(commit.oid, /^[0-9a-f]{40,64}$/);
});

test('NativeGitBackend.status: clean worktree returns empty list', async t => {
  const repoRoot = await provisionGitWorktree(t);
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const entries = await backend.status();
  t.deepEqual([...entries], []);
});

test('NativeGitBackend.status: classifies untracked, modified, added, deleted', async t => {
  const repoRoot = await provisionGitWorktree(t);
  // Step 1: create + commit two tracked files that will become
  // modified-only and deleted-only respectively.
  await fs.promises.writeFile(path.join(repoRoot, 'modified.txt'), 'v1');
  await fs.promises.writeFile(path.join(repoRoot, 'doomed.txt'), 'gone');
  await execFileAsync('git', ['add', 'modified.txt', 'doomed.txt'], {
    cwd: repoRoot,
  });
  await execFileAsync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=T', 'commit', '-m', 'baseline'],
    { cwd: repoRoot },
  );

  // Step 2: produce four distinct status shapes WITHOUT committing.
  await fs.promises.writeFile(path.join(repoRoot, 'untracked.txt'), 'u');
  await fs.promises.writeFile(path.join(repoRoot, 'modified.txt'), 'v2');
  await fs.promises.writeFile(path.join(repoRoot, 'added.txt'), 'new');
  await execFileAsync('git', ['add', 'added.txt'], { cwd: repoRoot });
  await fs.promises.rm(path.join(repoRoot, 'doomed.txt'));

  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const entries = await backend.status();
  const byPath = Object.fromEntries(entries.map(e => [e.path, e]));

  // Untracked: index 'clean' (no entry), worktree 'untracked'.
  t.is(byPath['untracked.txt'].index, 'clean');
  t.is(byPath['untracked.txt'].worktree, 'untracked');

  // Modified-on-disk-only: index 'clean', worktree 'modified'.
  t.is(byPath['modified.txt'].index, 'clean');
  t.is(byPath['modified.txt'].worktree, 'modified');

  // Added-but-not-committed: index 'added', worktree 'clean'.
  t.is(byPath['added.txt'].index, 'added');
  t.is(byPath['added.txt'].worktree, 'clean');

  // Deleted from worktree: index 'clean', worktree 'deleted'.
  t.is(byPath['doomed.txt'].index, 'clean');
  t.is(byPath['doomed.txt'].worktree, 'deleted');
});

test('Git.status reports merge conflicts with mount entries', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.writeFile(path.join(repoRoot, 'conflict.txt'), 'base\n');
  await execFileAsync('git', ['add', 'conflict.txt'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=T',
      'commit',
      '-m',
      'add conflict base',
    ],
    { cwd: repoRoot },
  );
  await execFileAsync('git', ['switch', '-c', 'feature'], { cwd: repoRoot });
  await fs.promises.writeFile(path.join(repoRoot, 'conflict.txt'), 'feature\n');
  await execFileAsync('git', ['add', 'conflict.txt'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=T',
      'commit',
      '-m',
      'feature edit',
    ],
    { cwd: repoRoot },
  );
  await execFileAsync('git', ['switch', 'main'], { cwd: repoRoot });
  await fs.promises.writeFile(path.join(repoRoot, 'conflict.txt'), 'main\n');
  await execFileAsync('git', ['add', 'conflict.txt'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=T', 'commit', '-m', 'main edit'],
    { cwd: repoRoot },
  );

  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });

  await t.throwsAsync(E(git).merge('feature'), {
    message: /CONFLICT|Automatic merge failed/,
  });
  const entries = await E(git).status();
  const row = entries.find(entry => entry.path === 'conflict.txt');
  if (row === undefined) {
    throw t.fail('expected a status row for conflict.txt');
  }
  t.is(row.index, 'conflicted');
  t.is(row.worktree, 'conflicted');
  t.deepEqual(await E(row.entry).segments(), ['conflict.txt']);
  // The conflicted entry is a file, so its live node exposes `text()`.
  const node = /** @type {import('../src/types.js').EndoMountFile} */ (
    row.node
  );
  t.regex(await E(node).text(), /<<<<<<< HEAD/);
});

test('Git.status wraps backend rows into GitStatusEntry with mount entries', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.mkdir(path.join(repoRoot, 'src'), { recursive: true });
  await fs.promises.writeFile(
    path.join(repoRoot, 'src', 'new.js'),
    'export default 1',
  );

  // Construct the public Git exo over a real mount so status() can mint
  // EndoMountEntry values.  This is the only test in this file that
  // exercises the exo + backend wired together.
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });

  const entries = await E(git).status();
  t.is(entries.length, 1);
  const [row] = entries;
  if (row === undefined) {
    throw t.fail('expected at least one status row');
  }
  t.is(row.path, 'src/new.js');
  t.is(row.index, 'clean');
  t.is(row.worktree, 'untracked');
  // The entry is an EndoMountEntry minted on the bound mount.  Its
  // segments reflect the repo-relative path split by `/`.
  t.deepEqual(await E(row.entry).segments(), ['src', 'new.js']);
  t.true(await E(mount).has(row.entry));
  // `src/new.js` resolves to an EndoMountFile.
  const node = /** @type {import('../src/types.js').EndoMountFile} */ (
    row.node
  );
  t.is(await E(node).text(), 'export default 1');
});

test('Git.status interface guard rejects backend rows with invalid enum values', async t => {
  // The status method is the canonical example for the typed-surface
  // discipline: its M.interface guard is M.callWhen() with a structured
  // return type that pins the index / worktree enums to the documented
  // GitIndexStatus / GitWorktreeStatus unions.  Verify the guard fires
  // on a backend row whose `index` is outside the union — this is the
  // regression-evidence test for commit 8baffb238 (the typed return).
  //
  // Without the typed return, a backend that drifts in either direction
  // (an enum string no longer in the union, or a missing required
  // field) would silently leak through the public exo and produce
  // garbled GitStatusEntry values for callers.  With the guard, the
  // call rejects at the boundary.
  const mount = await provisionMount(t);
  const backend = harden({
    ...makeNotYetImplementedBackend(),
    // Cast through `any`: the TypeScript signature would otherwise refuse
    // the bogus enum value (which is the entire point of this test —
    // verifying the runtime guard agrees with the type-level claim).
    status: /** @type {any} */ (
      async () =>
        harden([
          {
            path: 'x',
            index: 'bogus-status',
            worktree: 'clean',
          },
        ])
    ),
  });
  const git = makeGit({ mount, backend , lineageOf });

  await t.throwsAsync(E(git).status(), {
    // The interface guard formats the violation around the offending
    // field; either the field name or the enum-mismatch surface is
    // enough to pin the diagnostic.
    message: /index|bogus-status|status/,
  });
});

test('Git accepts both string and structured GitRef arguments', async t => {
  const mount = await provisionMount(t);
  // Override show/revParse to record the resolved name without throwing.
  /** @type {string[]} */
  const showCalls = [];
  /** @type {string[]} */
  const revParseCalls = [];
  const backend = harden({
    ...makeNotYetImplementedBackend(),
    show: async ref => {
      showCalls.push(ref);
      return '';
    },
    revParse: async ref => {
      revParseCalls.push(ref);
      return harden({
        name: ref,
        kind: /** @type {'commit'} */ ('commit'),
      });
    },
  });
  const git = makeGit({ mount, backend , lineageOf });

  await E(git).show('HEAD');
  await E(git).show({ name: 'main', kind: 'branch' });
  await E(git).revParse('v1.0');
  await E(git).revParse({ name: 'origin/main', kind: 'branch' });

  // Both string and { name } records normalize to the backend's single
  // string-named-ref input.
  t.deepEqual(showCalls, ['HEAD', 'main']);
  t.deepEqual(revParseCalls, ['v1.0', 'origin/main']);
});

// ---------------------------------------------------------------------------
// Git.filesystemAt(ref) — endo-fs Filesystem adapter over a git tree.
// See designs/endo-fs-from-git.md.
// ---------------------------------------------------------------------------

/**
 * Provision a worktree, write a file, commit it, and return the repo
 * path plus the file's bytes and blob OID.  Used by the
 * `filesystemAt` tests below.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {string} fileName
 * @param {string} content
 */
const provisionGitWorktreeWithFile = async (t, fileName, content) => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.writeFile(path.join(repoRoot, fileName), content);
  await execFileAsync('git', ['add', fileName], { cwd: repoRoot });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=T',
      'commit',
      '-m',
      `add ${fileName}`,
    ],
    { cwd: repoRoot },
  );
  const { stdout: blobOid } = await execFileAsync(
    'git',
    ['rev-parse', `HEAD:${fileName}`],
    { cwd: repoRoot },
  );
  const { stdout: treeOid } = await execFileAsync(
    'git',
    ['rev-parse', 'HEAD^{tree}'],
    { cwd: repoRoot },
  );
  return {
    repoRoot,
    blobOid: blobOid.trim(),
    treeOid: treeOid.trim(),
  };
};

test('Git.filesystemAt returns an endo-fs Filesystem with the expected surface', async t => {
  const { repoRoot, treeOid } = await provisionGitWorktreeWithFile(
    t,
    'README.md',
    'hello\n',
  );
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });

  const gitFs = /** @type {any} */ (await E(git).filesystemAt('HEAD'));

  // eslint-disable-next-line no-underscore-dangle
  const methods = await E(gitFs).__getMethodNames__();
  for (const name of ['root', 'named', 'statfs', 'brands', 'help']) {
    t.true(methods.includes(name), `Filesystem should advertise ${name}`);
  }

  const brands = await E(gitFs).brands();
  t.is(brands.length, 1);
  t.is(typeof brands[0], 'bigint');

  const stats = await E(gitFs).statfs();
  // wrapBackend stamps `type` from the description and merges in our
  // backend.statfs() result; both totalBytes/freeBytes are 0n because
  // an immutable historical tree has no "free / used" notion.
  t.true(stats.type.includes(treeOid));
  t.is(stats.totalBytes, 0n);
  t.is(stats.freeBytes, 0n);

  // wrapBackend exposes only the configured namedDirs; we pass none,
  // so any name is "not found."
  await t.throwsAsync(E(gitFs).named('alt'), { message: /ENOENT/ });

  const root = /** @type {any} */ (await E(gitFs).root());
  const qid = await E(root).getQid();
  t.is(qid.type, 'directory');
});

test('Git.filesystemAt: lookup returns a File', async t => {
  const { repoRoot } = await provisionGitWorktreeWithFile(
    t,
    'README.md',
    'hello\n',
  );
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });
  const gitFs = /** @type {any} */ (await E(git).filesystemAt('HEAD'));
  const root = /** @type {any} */ (await E(gitFs).root());

  const readme = /** @type {any} */ (await E(root).lookup('README.md'));
  const qid = await E(readme).getQid();
  t.is(qid.type, 'file');
});

test('Git.filesystemAt: OpenFile.read returns blob bytes; range reads slice', async t => {
  const content = 'abcdefghijklmnop\n';
  const { repoRoot } = await provisionGitWorktreeWithFile(
    t,
    'data.txt',
    content,
  );
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });
  const gitFs = /** @type {any} */ (await E(git).filesystemAt('HEAD'));
  const root = /** @type {any} */ (await E(gitFs).root());
  const file = /** @type {any} */ (await E(root).lookup('data.txt'));
  const opener = /** @type {any} */ (await E(file).open({ read: true }));

  // Read the full blob.  The OpenFile.read interface requires both
  // offset and length as bigints; pass the exact content length.
  const fullReader = await E(opener).read(0n, BigInt(content.length));
  const fullBytes = await collectReader(fullReader);
  t.is(new TextDecoder().decode(fullBytes), content);

  // Range read: bytes [3, 10).
  const sliceReader = await E(opener).read(3n, 7n);
  const sliceBytes = await collectReader(sliceReader);
  t.is(new TextDecoder().decode(sliceBytes), content.slice(3, 10));

  // Offset past end → empty.
  const pastReader = await E(opener).read(1000n, 100n);
  const pastBytes = await collectReader(pastReader);
  t.is(pastBytes.length, 0);

  // length === 0 → empty without streaming.
  const zeroReader = await E(opener).read(0n, 0n);
  const zeroBytes = await collectReader(zeroReader);
  t.is(zeroBytes.length, 0);

  await E(opener).close();
});

test('Git.filesystemAt: range reads at a high offset discard the prefix', async t => {
  // Reading a small window from deep inside a multi-KiB blob must not
  // retain the bytes before `offset` — they should stream by and be
  // dropped chunk-by-chunk.  We assert correctness; the memory
  // invariant is upheld by the streaming-skip implementation in
  // `git-filesystem.js#read`.
  const content = `${'x'.repeat(8 * 1024)}HELLOWORLD${'y'.repeat(8 * 1024)}`;
  const { repoRoot } = await provisionGitWorktreeWithFile(
    t,
    'data.txt',
    content,
  );
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });
  const gitFs = /** @type {any} */ (await E(git).filesystemAt('HEAD'));
  const root = /** @type {any} */ (await E(gitFs).root());
  const file = /** @type {any} */ (await E(root).lookup('data.txt'));
  const opener = /** @type {any} */ (await E(file).open({ read: true }));

  // Window straddles a likely chunk boundary; correctness here is the
  // public-API check the perf-claim leans on.
  const reader = await E(opener).read(8n * 1024n, 10n);
  const bytes = await collectReader(reader);
  t.is(new TextDecoder().decode(bytes), 'HELLOWORLD');

  await E(opener).close();
});

test('Git.filesystemAt: range reads reject negative / unsafe-integer bounds', async t => {
  const { repoRoot } = await provisionGitWorktreeWithFile(
    t,
    'README.md',
    'hi\n',
  );
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });
  const gitFs = /** @type {any} */ (await E(git).filesystemAt('HEAD'));
  const root = /** @type {any} */ (await E(gitFs).root());
  const file = /** @type {any} */ (await E(root).lookup('README.md'));
  const opener = /** @type {any} */ (await E(file).open({ read: true }));

  // Negative offset is rejected at the boundary instead of flowing
  // into the window math as 0.
  await t.throwsAsync(E(opener).read(-1n, 1n), {
    message: /EINVAL/,
  });
  // Negative length is rejected likewise.
  await t.throwsAsync(E(opener).read(0n, -1n), {
    message: /EINVAL/,
  });
  // Beyond MAX_SAFE_INTEGER would silently lose precision under
  // `Number()`; reject explicitly.
  const beyondSafe = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
  await t.throwsAsync(E(opener).read(beyondSafe, 1n), {
    message: /EINVAL/,
  });

  await E(opener).close();
});

test('Git.filesystemAt: lsTree cache evicts on rejection so a transient failure does not pin', async t => {
  const { repoRoot } = await provisionGitWorktreeWithFile(
    t,
    'README.md',
    'hi\n',
  );
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });

  // Wrap the native backend so the first `lsTree` call rejects (a
  // simulated transient git timeout) and later calls succeed.
  const nativeBackend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  let failuresRemaining = 1;
  const flakyBackend = harden({
    ...nativeBackend,
    /** @param {string} treeOid */
    lsTree: async treeOid => {
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        throw new Error('simulated transient ls-tree failure');
      }
      return nativeBackend.lsTree(treeOid);
    },
  });
  const git = makeGit({ mount, backend: flakyBackend , lineageOf });
  const gitFs = /** @type {any} */ (await E(git).filesystemAt('HEAD'));
  const root = /** @type {any} */ (await E(gitFs).root());

  // First lookup hits the simulated failure.
  await t.throwsAsync(E(root).lookup('README.md'), {
    message: /transient ls-tree/,
  });
  // Second lookup must NOT replay the cached rejection — it should
  // retry through the cleared cache and succeed.
  const file = await E(root).lookup('README.md');
  t.truthy(file);
});

test('Git.filesystemAt: File.snapshot returns a BlobRef over the blob bytes', async t => {
  const { repoRoot } = await provisionGitWorktreeWithFile(
    t,
    'README.md',
    'snapshot test\n',
  );
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });
  const gitFs = /** @type {any} */ (await E(git).filesystemAt('HEAD'));
  const root = /** @type {any} */ (await E(gitFs).root());
  const file = /** @type {any} */ (await E(root).lookup('README.md'));

  const blobRef = /** @type {any} */ (await E(file).snapshot());
  const info = await E(blobRef).getInfo();
  // wrapBackend's BlobRef hashes the captured bytes with SHA-256;
  // the size matches the blob length.
  t.is(info.algorithm, 'sha256');
  t.is(info.size, BigInt('snapshot test\n'.length));

  // fetch returns the bytes.
  const reader = await E(blobRef).fetch(0n, BigInt('snapshot test\n'.length));
  const bytes = await collectReader(reader);
  t.is(new TextDecoder().decode(bytes), 'snapshot test\n');
});

test('Git.filesystemAt: Directory.list yields entries in tree order', async t => {
  const { repoRoot } = await provisionGitWorktreeWithFile(t, 'a.txt', 'a\n');
  await fs.promises.writeFile(path.join(repoRoot, 'b.txt'), 'b\n');
  await execFileAsync('git', ['add', 'b.txt'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=T', 'commit', '-m', 'add b'],
    { cwd: repoRoot },
  );
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });
  const gitFs = /** @type {any} */ (await E(git).filesystemAt('HEAD'));
  const root = /** @type {any} */ (await E(gitFs).root());

  const cursor = /** @type {any} */ (await E(root).list());
  const readerRef = await E(cursor).stream();
  // eslint-disable-next-line global-require
  const { iterateReader } = await import('@endo/exo-stream/iterate-reader.js');
  /** @type {any[]} */
  const collected = [];
  for await (const value of iterateReader(readerRef)) {
    collected.push(value);
  }
  const names = collected.map(e => e.name);
  // Git ls-tree returns entries in lexical order.
  t.deepEqual(names, ['a.txt', 'b.txt']);
  for (const entry of collected) {
    t.is(entry.kind, 'file');
    t.is(entry.qid.type, 'file');
  }
});

test('Git.filesystemAt: mutating verbs all throw EACCES', async t => {
  const { repoRoot } = await provisionGitWorktreeWithFile(
    t,
    'README.md',
    'x\n',
  );
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });
  const gitFs = /** @type {any} */ (await E(git).filesystemAt('HEAD'));
  const root = /** @type {any} */ (await E(gitFs).root());

  for (const call of [
    () => E(root).create('new.txt', {}),
    () => E(root).mkdir('newdir', {}),
    () => E(root).unlink('README.md'),
    () => E(root).fsync(),
    () => E(root).setAttrs({}),
    () => E(root).materialise(['a', 'b'], {}),
  ]) {
    // eslint-disable-next-line no-await-in-loop
    await t.throwsAsync(call(), { message: /EACCES/ });
  }

  const file = /** @type {any} */ (await E(root).lookup('README.md'));
  await t.throwsAsync(E(file).setAttrs({}), { message: /EACCES/ });

  const opener = /** @type {any} */ (await E(file).open({ read: true }));
  await t.throwsAsync(E(opener).write(0n), { message: /EACCES/ });
  await t.throwsAsync(E(opener).truncate(0n), { message: /EACCES/ });
  await t.throwsAsync(E(opener).fsync({}), { message: /EACCES/ });
  await t.throwsAsync(E(opener).lock({}), { message: /EACCES/ });
});

test('Git.filesystemAt: open({ write: true }) rejects', async t => {
  const { repoRoot } = await provisionGitWorktreeWithFile(
    t,
    'README.md',
    'x\n',
  );
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });
  const gitFs = /** @type {any} */ (await E(git).filesystemAt('HEAD'));
  const root = /** @type {any} */ (await E(gitFs).root());
  const file = /** @type {any} */ (await E(root).lookup('README.md'));
  await t.throwsAsync(E(file).open({ write: true }), { message: /EACCES/ });
});

test('Git.filesystemAt: memoizes by canonical tree OID within one Git', async t => {
  const { repoRoot } = await provisionGitWorktreeWithFile(
    t,
    'README.md',
    'x\n',
  );
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });

  const a = await E(git).filesystemAt('HEAD');
  const b = await E(git).filesystemAt('HEAD');
  // Same cap; brand stability falls out of cap identity.
  t.is(a, b);

  // After another commit, HEAD resolves to a different tree OID, so
  // the cap differs.
  await fs.promises.writeFile(path.join(repoRoot, 'two.txt'), 'two\n');
  await execFileAsync('git', ['add', 'two.txt'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=T', 'commit', '-m', 'two'],
    { cwd: repoRoot },
  );
  const c = await E(git).filesystemAt('HEAD');
  t.not(a, c);
});

test('Git.filesystemAt: submodule entries are hidden from the tree view', async t => {
  // Provision a worktree, add a fake submodule entry by writing a
  // gitlink directly via update-index --add --cacheinfo.
  const { repoRoot } = await provisionGitWorktreeWithFile(
    t,
    'README.md',
    'x\n',
  );
  const fakeCommitOid = '1'.repeat(40);
  await execFileAsync(
    'git',
    ['update-index', '--add', '--cacheinfo', `160000,${fakeCommitOid},sub`],
    { cwd: repoRoot },
  );
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=T',
      'commit',
      '-m',
      'add submodule pointer',
    ],
    { cwd: repoRoot },
  );
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });
  const gitFs = /** @type {any} */ (await E(git).filesystemAt('HEAD'));
  const root = /** @type {any} */ (await E(gitFs).root());

  // Submodules surface as missing rather than as a distinct kind —
  // the base endo-fs vocabulary only knows files and directories.
  // Callers that need submodule traversal should obtain a separate
  // Git capability for the submodule's repository.
  await t.throwsAsync(E(root).lookup('sub'), { message: /ENOENT/ });
});

test('Git.filesystemAt: an empty tree exposes an empty root', async t => {
  // Provision an empty-tree commit by amending the init commit with
  // no tracked files.  `provisionGitWorktree` already left an empty
  // initial commit; assert the FS surfaces it cleanly.
  const repoRoot = await provisionGitWorktree(t);
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });
  const gitFs = /** @type {any} */ (await E(git).filesystemAt('HEAD'));
  const root = /** @type {any} */ (await E(gitFs).root());

  // `list()` returns a Cursor that yields zero entries.
  const cursor = /** @type {any} */ (await E(root).list());
  const readerRef = await E(cursor).stream();
  // eslint-disable-next-line global-require
  const { iterateReader } = await import('@endo/exo-stream/iterate-reader.js');
  const collected = [];
  for await (const value of iterateReader(readerRef)) {
    collected.push(value);
  }
  t.deepEqual(collected, []);

  // `lookup` on any name throws ENOENT.
  await t.throwsAsync(E(root).lookup('anything'), { message: /ENOENT/ });
});

test('Git.filesystemAt: directories report size 0n via getStat', async t => {
  // A subdirectory in the tree should report `kind: 'directory'` and
  // `size: 0n` (git trees have no inherent size).
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.mkdir(path.join(repoRoot, 'subdir'));
  await fs.promises.writeFile(path.join(repoRoot, 'subdir', 'a.txt'), 'a\n');
  await execFileAsync('git', ['add', 'subdir/a.txt'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=T', 'commit', '-m', 'subdir'],
    { cwd: repoRoot },
  );
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  const git = makeGit({ mount, backend , lineageOf });
  const gitFs = /** @type {any} */ (await E(git).filesystemAt('HEAD'));
  const root = /** @type {any} */ (await E(gitFs).root());
  const subdir = /** @type {any} */ (await E(root).lookup('subdir'));
  const stat = await E(subdir).getStat();
  t.is(stat.size, 0n);
});

test('Git.filesystemAt: lsTree and resolvePath are cached per Filesystem', async t => {
  const repoRoot = await provisionGitWorktree(t);
  await fs.promises.writeFile(path.join(repoRoot, 'README.md'), 'hi\n');
  await execFileAsync('git', ['add', 'README.md'], { cwd: repoRoot });
  await execFileAsync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=T', 'commit', '-m', 'add'],
    { cwd: repoRoot },
  );
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });

  // Wrap the native backend with a spy that counts `lsTree` calls.
  const nativeBackend = makeNativeGitBackend({ repoRoot , makeReaderRef });
  let lsTreeCalls = 0;
  const spyBackend = harden({
    ...nativeBackend,
    /** @param {string} treeOid */
    lsTree: async treeOid => {
      lsTreeCalls += 1;
      return nativeBackend.lsTree(treeOid);
    },
  });
  const git = makeGit({ mount, backend: spyBackend , lineageOf });
  const gitFs = /** @type {any} */ (await E(git).filesystemAt('HEAD'));
  const root = /** @type {any} */ (await E(gitFs).root());

  // First lookup populates the cache.
  await E(root).lookup('README.md');
  const afterFirst = lsTreeCalls;
  // Second lookup of the same path must not re-call lsTree.
  await E(root).lookup('README.md');
  t.is(lsTreeCalls, afterFirst, 'lsTree should be cached per tree OID');
});

/**
 * Collect a PassableBytesReader into a single Uint8Array.
 *
 * @param {any} readerRef
 */
const collectReader = async readerRef => {
  // eslint-disable-next-line global-require
  const { iterateBytesReader } =
    await import('@endo/exo-stream/iterate-bytes-reader.js');
  const chunks = [];
  let total = 0;
  for await (const chunk of iterateBytesReader(readerRef)) {
    chunks.push(chunk);
    total += chunk.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
};
