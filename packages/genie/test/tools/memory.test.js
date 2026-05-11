// @ts-check

import '@endo/harden';

import test from 'ava';
import { makeMemoryTools } from '../../src/tools/memory.js';
import { makeMemoryVFS } from '../../src/tools/vfs-memory.js';

/**
 * Helper: create memory tools backed by an in-memory VFS.
 * Pre-creates the root directory so that tools can write immediately.
 *
 * @param {string} [root]
 * @returns {Promise<ReturnType<typeof makeMemoryTools> & { vfs: ReturnType<typeof makeMemoryVFS> }>}
 */
const setup = async (root = '/workspace') => {
  const vfs = makeMemoryVFS(root);
  await vfs.mkdir(root, { recursive: true });
  const tools = makeMemoryTools({ root, vfs });
  return { ...tools, vfs };
};

// ---------------------------------------------------------------------------
// memorySet — basic writes
// ---------------------------------------------------------------------------

test('memorySet creates a new file', async t => {
  const { memorySet, vfs } = await setup();
  const result = await memorySet.execute({
    path: 'MEMORY.md',
    content: '# Memory\n',
  });
  t.true(result.success);
  t.is(result.path, 'MEMORY.md');
  t.is(result.bytesWritten, 9);

  const stored = await vfs.readFile('/workspace/MEMORY.md');
  t.is(stored, '# Memory\n');
});

test('memorySet overwrites an existing file', async t => {
  const { memorySet, vfs } = await setup();
  await memorySet.execute({ path: 'MEMORY.md', content: 'first' });
  await memorySet.execute({ path: 'MEMORY.md', content: 'second' });

  const stored = await vfs.readFile('/workspace/MEMORY.md');
  t.is(stored, 'second');
});

test('memorySet appends to an existing file', async t => {
  const { memorySet, vfs } = await setup();
  await memorySet.execute({ path: 'MEMORY.md', content: 'line1\n' });
  const result = await memorySet.execute({
    path: 'MEMORY.md',
    content: 'line2\n',
    append: true,
  });
  t.true(result.success);
  t.is(result.bytesWritten, 6);

  const stored = await vfs.readFile('/workspace/MEMORY.md');
  t.is(stored, 'line1\nline2\n');
});

test('memorySet append to non-existent file creates it', async t => {
  const { memorySet, vfs } = await setup();
  const result = await memorySet.execute({
    path: 'MEMORY.md',
    content: 'fresh\n',
    append: true,
  });
  t.true(result.success);

  const stored = await vfs.readFile('/workspace/MEMORY.md');
  t.is(stored, 'fresh\n');
});

test('memorySet creates intermediate directories', async t => {
  const { memorySet, vfs } = await setup();
  const result = await memorySet.execute({
    path: 'memory/notes.md',
    content: '# Notes\n',
  });
  t.true(result.success);

  const stored = await vfs.readFile('/workspace/memory/notes.md');
  t.is(stored, '# Notes\n');
});

// ---------------------------------------------------------------------------
// memoryGet — reading files
// ---------------------------------------------------------------------------

test('memoryGet reads entire file', async t => {
  const { memorySet, memoryGet } = await setup();
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'line1\nline2\nline3\n',
  });

  const result = await memoryGet.execute({ path: 'MEMORY.md' });
  t.true(result.success);
  t.is(result.path, 'MEMORY.md');
  // streamLines splits on '\n'; the trailing newline produces no
  // additional line, so the joined content omits it.
  t.is(result.content, 'line1\nline2\nline3');
});

test('memoryGet reads a specific line range', async t => {
  const { memorySet, memoryGet } = await setup();
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'a\nb\nc\nd\ne\n',
  });

  const result = await memoryGet.execute({
    path: 'MEMORY.md',
    from: 2,
    lines: 2,
  });
  t.true(result.success);
  t.is(result.content, 'b\nc');
});

test('memoryGet from defaults to 1', async t => {
  const { memorySet, memoryGet } = await setup();
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'first\nsecond\n',
  });

  const result = await memoryGet.execute({
    path: 'MEMORY.md',
    lines: 1,
  });
  t.is(result.content, 'first');
});

test('memoryGet throws for missing file', async t => {
  const { memoryGet } = await setup();
  const err = await t.throwsAsync(() => memoryGet.execute({ path: 'nope.md' }));
  t.truthy(err);
  t.true(/** @type {Error} */ (err).message.includes('File not found'));
});

test('memoryGet throws for out-of-range from', async t => {
  const { memorySet, memoryGet } = await setup();
  await memorySet.execute({ path: 'MEMORY.md', content: 'only one line' });

  const err = await t.throwsAsync(() =>
    memoryGet.execute({ path: 'MEMORY.md', from: 999 }),
  );
  t.truthy(err);
  t.true(/** @type {Error} */ (err).message.includes('Invalid range'));
});

// ---------------------------------------------------------------------------
// memorySearch — substring backend
// ---------------------------------------------------------------------------

test('memorySearch finds matching lines in MEMORY.md', async t => {
  const { memorySet, memorySearch } = await setup();
  await memorySet.execute({
    path: 'MEMORY.md',
    content: '# Preferences\ntheme: dark\neditor: vim\ntheme: solarized\n',
  });

  const result = await memorySearch.execute({ query: 'theme' });
  t.true(result.success);
  t.is(result.results.length, 2);
  t.is(result.results[0].file, 'MEMORY.md');
  t.is(result.results[0].content, 'theme: dark');
  t.is(result.results[1].content, 'theme: solarized');
});

test('memorySearch is case-insensitive', async t => {
  const { memorySet, memorySearch } = await setup();
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'Hello World\nhello world\nHELLO WORLD\n',
  });

  const result = await memorySearch.execute({ query: 'hello' });
  t.true(result.success);
  t.is(result.results.length, 3);
});

test('memorySearch respects limit', async t => {
  const { memorySet, memorySearch } = await setup();
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'match\nmatch\nmatch\nmatch\nmatch\n',
  });

  const result = await memorySearch.execute({ query: 'match', limit: 2 });
  t.is(result.results.length, 2);
  t.is(result.limit, 2);
});

test('memorySearch returns empty results for no match', async t => {
  const { memorySet, memorySearch } = await setup();
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'nothing relevant here\n',
  });

  const result = await memorySearch.execute({ query: 'xyzzy' });
  t.true(result.success);
  t.is(result.results.length, 0);
});

test('memorySearch finds matches in memory/ directory', async t => {
  const { memorySet, memorySearch } = await setup();
  await memorySet.execute({
    path: 'memory/notes.md',
    content: '# Project Notes\nRemember to refactor\n',
  });

  const result = await memorySearch.execute({ query: 'refactor' });
  t.true(result.success);
  t.is(result.results.length, 1);
  t.is(result.results[0].file, 'notes.md');
  t.is(result.results[0].content, 'Remember to refactor');
});

test('memorySearch searches across multiple files', async t => {
  const { memorySet, memorySearch } = await setup();
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'TODO: fix bug\n',
  });
  await memorySet.execute({
    path: 'memory/tasks.md',
    content: 'TODO: add tests\n',
  });

  const result = await memorySearch.execute({ query: 'TODO' });
  t.true(result.success);
  t.is(result.results.length, 2);
});

test('memorySearch includes correct line numbers', async t => {
  const { memorySet, memorySearch } = await setup();
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'line one\nline two\nfind me\nline four\n',
  });

  const result = await memorySearch.execute({ query: 'find me' });
  t.is(result.results.length, 1);
  t.is(result.results[0].line, 3);
  t.is(result.results[0].content, 'find me');
});

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

test('path traversal is rejected', async t => {
  const { memoryGet } = await setup();
  const err = await t.throwsAsync(() =>
    memoryGet.execute({ path: '../../../etc/passwd' }),
  );
  t.truthy(err);
  t.true(
    /** @type {Error} */ (err).message.includes('must resolve under root'),
  );
});

test('null bytes in path are rejected', async t => {
  const { memoryGet } = await setup();
  const err = await t.throwsAsync(() =>
    memoryGet.execute({ path: 'foo\0bar' }),
  );
  t.truthy(err);
  t.true(/** @type {Error} */ (err).message.includes('null bytes'));
});

// ---------------------------------------------------------------------------
// Startup indexing — pre-existing files
// ---------------------------------------------------------------------------

test('pre-existing MEMORY.md is indexed on startup', async t => {
  const root = '/workspace';
  const vfs = makeMemoryVFS(root);
  await vfs.mkdir(root, { recursive: true });
  await vfs.writeFile(`${root}/MEMORY.md`, 'startup note about cats\n');

  const { memorySearch, indexing } = makeMemoryTools({ root, vfs });
  await indexing;

  const result = await memorySearch.execute({
    query: 'cats',
    waitForIndex: false,
  });
  t.true(result.success);
  t.is(result.results.length, 1);
  t.is(result.results[0].content, 'startup note about cats');
});

test('pre-existing files in memory/ dir are indexed on startup', async t => {
  const root = '/workspace';
  const vfs = makeMemoryVFS(root);
  await vfs.mkdir(`${root}/memory`, { recursive: true });
  await vfs.writeFile(`${root}/memory/notes.md`, 'important decision\n');
  await vfs.writeFile(`${root}/memory/prefs.md`, 'theme: dark\n');

  const { memorySearch, indexing } = makeMemoryTools({ root, vfs });
  await indexing;

  const result = await memorySearch.execute({
    query: 'decision',
    waitForIndex: false,
  });
  t.true(result.success);
  t.is(result.results.length, 1);
  t.is(result.results[0].file, 'notes.md');
});

test('indexing promise resolves even with no pre-existing files', async t => {
  const root = '/workspace';
  const vfs = makeMemoryVFS(root);
  await vfs.mkdir(root, { recursive: true });

  const { indexing } = makeMemoryTools({ root, vfs });
  await indexing;
  t.pass();
});
