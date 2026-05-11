// @ts-check

/**
 * Tests for the shared tool-registry helper.
 *
 * The registry is consumed by both `packages/genie/dev-repl.js` and
 * `packages/genie/main.js`; these tests pin the include-list filter
 * semantics, the plugin default shape, and the dev-repl include
 * shape so future edits to the registry do not silently change
 * either deployment's tool surface.
 *
 * Tests run against a temporary workspace directory so the file /
 * memory tools can initialise without polluting the tree.
 */

import '@endo/init/debug.js';

import test from 'ava';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  buildGenieTools,
  PLUGIN_DEFAULT_INCLUDE,
} from '../../src/tools/registry.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Create a fresh empty workspace directory and register a cleanup
 * hook on the test context.
 *
 * @param {import('ava').ExecutionContext} t
 * @returns {Promise<string>}
 */
const makeWorkspace = async t => {
  const dir = await mkdtemp(join(tmpdir(), 'genie-registry-test-'));
  t.teardown(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
};

/**
 * Await memory-tool indexing so the test doesn't race the background
 * index pass across teardown boundaries.
 *
 * @param {ReturnType<typeof buildGenieTools>} registry
 */
const settle = async registry => {
  await Promise.resolve();
  if (registry.memoryTools) {
    await registry.memoryTools.indexing;
  }
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test('PLUGIN_DEFAULT_INCLUDE pins the daemon-hosted tool set', t => {
  t.deepEqual(Array.from(PLUGIN_DEFAULT_INCLUDE), [
    'bash',
    'files',
    'memory',
    'webFetch',
    'webSearch',
  ]);
});

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

test('buildGenieTools — returns the documented shape', async t => {
  const workspaceDir = await makeWorkspace(t);
  const registry = buildGenieTools({
    workspaceDir,
    include: [],
  });
  t.is(typeof registry.tools, 'object');
  t.is(typeof registry.listTools, 'function');
  t.is(typeof registry.execTool, 'function');
  t.is(registry.memoryTools, undefined);
  t.is(registry.searchBackend, undefined);
});

test('buildGenieTools — empty include yields empty tool record', async t => {
  const workspaceDir = await makeWorkspace(t);
  const registry = buildGenieTools({
    workspaceDir,
    include: [],
  });
  t.deepEqual(Object.keys(registry.tools), []);
  t.deepEqual(registry.listTools(), []);
});

// ---------------------------------------------------------------------------
// Include-list filter
// ---------------------------------------------------------------------------

test('buildGenieTools — include `bash` alone', async t => {
  const workspaceDir = await makeWorkspace(t);
  const registry = buildGenieTools({
    workspaceDir,
    include: ['bash'],
  });
  t.deepEqual(Object.keys(registry.tools), ['bash']);
});

test('buildGenieTools — include `exec` alone (no bash)', async t => {
  const workspaceDir = await makeWorkspace(t);
  const registry = buildGenieTools({
    workspaceDir,
    include: ['exec'],
  });
  t.deepEqual(Object.keys(registry.tools), ['exec']);
});

test('buildGenieTools — include `git` alone wires the attenuated tool', async t => {
  const workspaceDir = await makeWorkspace(t);
  const registry = buildGenieTools({
    workspaceDir,
    include: ['git'],
  });
  t.deepEqual(Object.keys(registry.tools), ['git']);
  t.truthy(registry.tools.git);
  t.is(typeof registry.tools.git.help(), 'string');
});

test('buildGenieTools — include `files` exposes the filesystem suite', async t => {
  const workspaceDir = await makeWorkspace(t);
  const registry = buildGenieTools({
    workspaceDir,
    include: ['files'],
  });
  const names = Object.keys(registry.tools);
  t.true(names.includes('readFile'));
  t.true(names.includes('writeFile'));
  t.true(names.includes('editFile'));
  // memoryTools / bash / exec / git / web are intentionally absent.
  t.false(names.includes('bash'));
  t.false(names.includes('memoryGet'));
  t.is(registry.memoryTools, undefined);
});

test('buildGenieTools — include `memory` exposes the memory suite and bundle', async t => {
  const workspaceDir = await makeWorkspace(t);
  const registry = buildGenieTools({
    workspaceDir,
    include: ['memory'],
  });
  await settle(registry);
  const names = Object.keys(registry.tools);
  t.true(names.includes('memoryGet'));
  t.true(names.includes('memorySet'));
  t.true(names.includes('memorySearch'));
  t.truthy(registry.memoryTools);
  if (registry.memoryTools) {
    t.is(registry.memoryTools.memoryGet, registry.tools.memoryGet);
    t.is(typeof registry.memoryTools.indexing.then, 'function');
  }
});

test('buildGenieTools — include `web` exposes webFetch + webSearch', async t => {
  const workspaceDir = await makeWorkspace(t);
  const registry = buildGenieTools({
    workspaceDir,
    include: ['web'],
  });
  const names = Object.keys(registry.tools);
  t.true(names.includes('webFetch'));
  t.true(names.includes('webSearch'));
});

// ---------------------------------------------------------------------------
// Defaults / deployment presets
// ---------------------------------------------------------------------------

test('buildGenieTools — default include matches the plugin shape (pre-refactor)', async t => {
  const workspaceDir = await makeWorkspace(t);
  const registry = buildGenieTools({ workspaceDir });
  await settle(registry);
  const names = Object.keys(registry.tools).sort();

  // Plugin pre-refactor (main.js) produced exactly:
  //   bash, readFile, writeFile, editFile, listDirectory,
  //   makeDirectory, removeFile, removeDirectory,
  //   memoryGet, memorySet, memorySearch, webFetch, webSearch
  // The exact filesystem set is owned by `makeFileTools`; we only
  // assert the gate groups here so renames inside filesystem.js
  // don't break the contract test.
  t.true(names.includes('bash'));
  t.false(names.includes('exec'));
  t.false(names.includes('git'));
  t.true(names.includes('readFile'));
  t.true(names.includes('memoryGet'));
  t.true(names.includes('webFetch'));
  t.true(names.includes('webSearch'));
});

// ---------------------------------------------------------------------------
// listTools / execTool
// ---------------------------------------------------------------------------

test('listTools — returns name + summary for every included tool', async t => {
  const workspaceDir = await makeWorkspace(t);
  const registry = buildGenieTools({
    workspaceDir,
    include: ['bash', 'exec'],
  });
  const specs = registry.listTools();
  t.deepEqual(specs.map(s => s.name).sort(), ['bash', 'exec']);
  for (const spec of specs) {
    t.is(typeof spec.summary, 'string');
    t.true(spec.summary.length > 0);
  }
});

test('execTool — dispatches to the named tool', async t => {
  const workspaceDir = await makeWorkspace(t);
  const registry = buildGenieTools({
    workspaceDir,
    include: ['memory'],
  });
  await settle(registry);
  // memorySet is a safe tool to exercise against the temp workspace.
  const result = await registry.execTool('memorySet', {
    path: 'note.md',
    content: 'hello',
  });
  t.truthy(result);
});

test('execTool — unknown name throws', async t => {
  const workspaceDir = await makeWorkspace(t);
  const registry = buildGenieTools({
    workspaceDir,
    include: ['bash'],
  });
  await t.throwsAsync(() => registry.execTool('nosuch', {}), {
    message: /Unknown tool: nosuch/,
  });
});

// ---------------------------------------------------------------------------
// searchBackend plumbing
// ---------------------------------------------------------------------------

test('searchBackend — echoes the caller-supplied backend', async t => {
  const workspaceDir = await makeWorkspace(t);
  async function* emptyPaths() {
    // no paths
  }
  const fakeBackend = harden({
    search: async () => [],
    index: async () => undefined,
    remove: async () => undefined,
    indexedPaths: emptyPaths,
    sync: async () => undefined,
  });
  const registry = buildGenieTools({
    workspaceDir,
    include: ['memory'],
    searchBackend: /** @type {any} */ (fakeBackend),
  });
  await settle(registry);
  t.is(registry.searchBackend, fakeBackend);
});

test('searchBackend — absent when caller supplies none', async t => {
  const workspaceDir = await makeWorkspace(t);
  const registry = buildGenieTools({
    workspaceDir,
    include: ['memory'],
  });
  await settle(registry);
  t.is(registry.searchBackend, undefined);
});
