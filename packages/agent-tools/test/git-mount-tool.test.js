// @ts-check

// Establish a SES perimeter (provides the `harden` global).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';

import { makeGitMountTools } from '../src/git-mount-tool.js';

/** @import { ERef } from '@endo/eventual-send' */
/** @import { GitMountToolCapability } from '../src/types.js' */

/**
 * A stub mount whose `entry(pathArg)` mints an inert Far entry that remembers
 * the segments it was resolved from, mirroring the daemon mount's
 * `entry().segments()` contract that `Git.add` consumes.
 */
const makeStubMount = () =>
  Far('StubMount', {
    entry: pathArg => {
      const segments = Array.isArray(pathArg)
        ? [...pathArg]
        : String(pathArg).split('/');
      return Far('StubMountEntry', {
        segments: () => harden([...segments]),
      });
    },
  });

/**
 * Stub Git capability that bridges through a stub mount. `add` records the
 * repo-relative path each supplied entry resolves to (via `segments()`), so a
 * test can assert the path→entry marshalling reached the cap intact.
 *
 * @param {{ statusRows?: unknown[], addCalls?: unknown[][] }} [opts]
 * @returns {ERef<GitMountToolCapability>}
 */
const makeStubGit = ({ statusRows = [], addCalls = [] } = {}) => {
  const mount = makeStubMount();
  return /** @type {ERef<GitMountToolCapability>} */ (
    /** @type {unknown} */ (
      Far('StubGit', {
        worktree: async () => mount,
        status: async () => harden(statusRows),
        add: async entries => {
          await null;
          const paths = await Promise.all(
            entries.map(async entry => {
              await null;
              const segments = await E(entry).segments();
              return segments.join('/');
            }),
          );
          addCalls.push(paths);
        },
      })
    )
  );
};

test('makeGitMountTools builds a status and an add record', t => {
  const tools = makeGitMountTools(makeStubGit());
  const names = tools.map(tool => tool.name).sort();
  t.deepEqual(names, ['add', 'status']);
  for (const tool of tools) {
    t.is(typeof tool.description, 'string');
    t.truthy(tool.parameters);
    t.is(tool.inputSchema, tool.parameters);
    t.is(typeof tool.invoke, 'function');
  }
});

const byNameOf = tools => name => {
  const found = tools.find(tool => tool.name === name);
  if (!found) throw new Error(`no tool named ${name}`);
  return found;
};

test('status strips the entry/node remotables to JSON-safe rows', async t => {
  const inertEntry = Far('EndoMountEntry', {});
  const inertNode = Far('Node', {});
  const statusRows = harden([
    {
      entry: inertEntry,
      path: 'src/a.js',
      index: 'modified',
      worktree: 'clean',
      node: inertNode,
    },
    {
      entry: inertEntry,
      path: 'src/b.js',
      index: 'renamed',
      worktree: 'clean',
      renamedFrom: 'src/old.js',
      node: inertNode,
    },
    {
      entry: inertEntry,
      path: 'gone.js',
      index: 'deleted',
      worktree: 'deleted',
    },
  ]);
  const tools = makeGitMountTools(makeStubGit({ statusRows }));
  const rows = await byNameOf(tools)('status').invoke({});
  t.deepEqual(rows, [
    { path: 'src/a.js', index: 'modified', worktree: 'clean' },
    {
      path: 'src/b.js',
      index: 'renamed',
      worktree: 'clean',
      renamedFrom: 'src/old.js',
    },
    { path: 'gone.js', index: 'deleted', worktree: 'deleted' },
  ]);
  // The projection must not smuggle remotables onto the JSON wire.
  for (const row of /** @type {object[]} */ (rows)) {
    t.false('entry' in row);
    t.false('node' in row);
  }
});

test('status rejects a stray argument key', async t => {
  const tools = makeGitMountTools(makeStubGit());
  await t.throwsAsync(() => byNameOf(tools)('status').invoke({ path: 'x' }));
});

test('add resolves path strings to mount entries and calls the cap', async t => {
  const addCalls = [];
  const tools = makeGitMountTools(makeStubGit({ addCalls }));
  const result = await byNameOf(tools)('add').invoke({
    paths: ['src/a.js', 'src/dir/b.js'],
  });
  t.deepEqual(addCalls, [['src/a.js', 'src/dir/b.js']]);
  t.is(result, 'Staged 2 paths.');
});

test('add normalizes redundant path separators before resolving', async t => {
  const addCalls = [];
  const tools = makeGitMountTools(makeStubGit({ addCalls }));
  await byNameOf(tools)('add').invoke({ paths: ['a//b/', './c'] });
  t.deepEqual(addCalls, [['a/b', 'c']]);
});

test('add reports the singular staged path', async t => {
  const addCalls = [];
  const tools = makeGitMountTools(makeStubGit({ addCalls }));
  const result = await byNameOf(tools)('add').invoke({ paths: ['only.js'] });
  t.is(result, 'Staged 1 path.');
});

test('add rejects an empty path list and an empty-string path', async t => {
  const tools = makeGitMountTools(makeStubGit());
  const byName = byNameOf(tools);
  await t.throwsAsync(() => byName('add').invoke({ paths: [] }), {
    message: /non-empty/,
  });
  await t.throwsAsync(() => byName('add').invoke({ paths: ['a', ''] }), {
    message: /non-empty strings/,
  });
});

test('add rejects a non-string path element and a missing/extra key', async t => {
  const tools = makeGitMountTools(makeStubGit());
  const byName = byNameOf(tools);
  await null;
  // The runtime guard (M.arrayOf(M.string())) rejects a non-string element.
  await t.throwsAsync(() => byName('add').invoke({ paths: ['a', 42] }));
  // Missing the required `paths` key is rejected before the cap is touched.
  const missing = await t.throwsAsync(() => byName('add').invoke({}));
  t.true(missing !== undefined && missing.message.includes('paths'));
  // An out-of-band key is rejected fail-closed.
  const extra = await t.throwsAsync(() =>
    byName('add').invoke({ paths: ['a'], bogus: 'x' }),
  );
  t.true(extra !== undefined && extra.message.includes('bogus'));
});

test('add rejects a path that resolves to the worktree root', async t => {
  const addCalls = [];
  const tools = makeGitMountTools(makeStubGit({ addCalls }));
  const byName = byNameOf(tools);
  // '.', '/', '//', and './' all collapse to zero segments under
  // `pathToSegments`; each would otherwise resolve to the worktree-root entry
  // and reach the cap as an empty pathspec, so the tool rejects them before
  // touching the mount.
  await t.throwsAsync(() => byName('add').invoke({ paths: ['.'] }), {
    message: /worktree root/,
  });
  await t.throwsAsync(() => byName('add').invoke({ paths: ['/'] }), {
    message: /worktree root/,
  });
  await t.throwsAsync(() => byName('add').invoke({ paths: ['//'] }), {
    message: /worktree root/,
  });
  await t.throwsAsync(() => byName('add').invoke({ paths: ['./'] }), {
    message: /worktree root/,
  });
  // A root-collapsing path mixed with a real one is still rejected, and
  // nothing partial reaches the cap.
  await t.throwsAsync(() => byName('add').invoke({ paths: ['real.js', '.'] }), {
    message: /worktree root/,
  });
  t.deepEqual(
    addCalls,
    [],
    'no staging reaches the cap when a path is rejected',
  );
});

test('add forwards a ".." segment to the capability, unfiltered', async t => {
  const addCalls = [];
  const tools = makeGitMountTools(makeStubGit({ addCalls }));
  // The tool does not reject `..` with a brittle string check; it passes the
  // resolved segments to the mount, which contains the traversal (clamped at
  // the worktree root). This pins that containment is the capability's job,
  // not the tool's.
  await byNameOf(tools)('add').invoke({ paths: ['../x', 'a/../b'] });
  t.deepEqual(addCalls, [['../x', 'a/../b']]);
});

test('status on a clean tree returns an empty array', async t => {
  const tools = makeGitMountTools(makeStubGit());
  const rows = await byNameOf(tools)('status').invoke({});
  t.deepEqual(rows, []);
});
