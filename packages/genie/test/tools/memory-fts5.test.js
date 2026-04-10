// @ts-check
import '@endo/init/debug.js';

import test from 'ava';
import { makeMemoryTools } from '../../src/tools/memory.js';
import { makeMemoryVFS } from '../../src/tools/vfs-memory.js';
import { makeFTS5Backend } from '../../src/tools/fts5-backend.js';

/**
 * Helper: create memory tools backed by an in-memory VFS and an
 * in-memory FTS5 search backend.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {string} [root]
 */
const setup = async (t, root = '/workspace') => {
  const searchBackend = makeFTS5Backend();
  t.teardown(async () => {
    if (searchBackend.sync) {
      await searchBackend.sync();
    }
  });
  const vfs = makeMemoryVFS();
  await vfs.mkdir(root, { recursive: true });
  const tools = makeMemoryTools({ root, vfs, searchBackend });
  return { ...tools, vfs };
};

// ---------------------------------------------------------------------------
// memorySet — basic writes (same as substring backend)
// ---------------------------------------------------------------------------

test('memorySet creates a new file', async t => {
  const { memorySet, vfs } = await setup(t);
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
  const { memorySet, vfs } = await setup(t);
  await memorySet.execute({ path: 'MEMORY.md', content: 'first' });
  await memorySet.execute({ path: 'MEMORY.md', content: 'second' });

  const stored = await vfs.readFile('/workspace/MEMORY.md');
  t.is(stored, 'second');
});

test('memorySet appends to an existing file', async t => {
  const { memorySet, vfs } = await setup(t);
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

test('memorySet creates intermediate directories', async t => {
  const { memorySet, vfs } = await setup(t);
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
  const { memorySet, memoryGet } = await setup(t);
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'line1\nline2\nline3\n',
  });

  const result = await memoryGet.execute({ path: 'MEMORY.md' });
  t.true(result.success);
  t.is(result.path, 'MEMORY.md');
  t.is(result.content, 'line1\nline2\nline3');
});

test('memoryGet reads a specific line range', async t => {
  const { memorySet, memoryGet } = await setup(t);
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

test('memoryGet throws for missing file', async t => {
  const { memoryGet } = await setup(t);
  const err = await t.throwsAsync(() =>
    memoryGet.execute({ path: 'nope.md' }),
  );
  t.truthy(err);
  t.true(
    /** @type {Error} */ (err).message.includes('File not found'),
  );
});

// ---------------------------------------------------------------------------
// memorySearch — FTS5 backend
// ---------------------------------------------------------------------------

test('memorySearch finds matching lines', async t => {
  const { memorySet, memorySearch } = await setup(t);
  await memorySet.execute({
    path: 'MEMORY.md',
    content: '# Preferences\ntheme: dark\neditor: vim\ntheme: solarized\n',
  });

  const result = await memorySearch.execute({ query: 'theme' });
  t.true(result.success);
  t.is(result.results.length, 2);
  // Both results should reference MEMORY.md and contain "theme".
  for (const r of result.results) {
    t.is(r.file, 'MEMORY.md');
    t.true(r.content.includes('theme'));
  }
});

test('memorySearch respects limit', async t => {
  const { memorySet, memorySearch } = await setup(t);
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'match one\nmatch two\nmatch three\nmatch four\nmatch five\n',
  });

  const result = await memorySearch.execute({ query: 'match', limit: 2 });
  t.is(result.results.length, 2);
  t.is(result.limit, 2);
});

test('memorySearch returns empty results for no match', async t => {
  const { memorySet, memorySearch } = await setup(t);
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'nothing relevant here\n',
  });

  const result = await memorySearch.execute({ query: 'xyzzy' });
  t.true(result.success);
  t.is(result.results.length, 0);
});

test('memorySearch includes correct line numbers', async t => {
  const { memorySet, memorySearch } = await setup(t);
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'line one\nline two\nfind me here\nline four\n',
  });

  const result = await memorySearch.execute({ query: '"find me"' });
  t.is(result.results.length, 1);
  t.is(result.results[0].line, 3);
  t.true(result.results[0].content.includes('find me'));
});

// ---------------------------------------------------------------------------
// FTS5-specific features
// ---------------------------------------------------------------------------

test('memorySearch uses Porter stemming', async t => {
  const { memorySet, memorySearch } = await setup(t);
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'The runners were running quickly\n',
  });

  const result = await memorySearch.execute({ query: 'run' });
  t.is(result.results.length, 1);
  t.true(result.results[0].content.includes('running'));
});

test('memorySearch supports prefix queries', async t => {
  const { memorySet, memorySearch } = await setup(t);
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'JavaScript and TypeScript are popular\n',
  });

  const result = await memorySearch.execute({ query: 'java*' });
  t.is(result.results.length, 1);
  t.true(result.results[0].content.includes('JavaScript'));
});

test('memorySearch supports quoted phrase queries', async t => {
  const { memorySet, memorySearch } = await setup(t);
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'the brown fox\nthe quick brown fox\nbrown fox quick\n',
  });

  const result = await memorySearch.execute({ query: '"quick brown fox"' });
  t.is(result.results.length, 1);
  t.is(result.results[0].line, 2);
});

test('memorySearch supports NOT operator', async t => {
  const { memorySet, memorySearch } = await setup(t);
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'apple pie\ncherry pie\napple sauce\n',
  });

  const result = await memorySearch.execute({ query: 'apple NOT pie' });
  t.is(result.results.length, 1);
  t.true(result.results[0].content.includes('sauce'));
});

test('memorySearch supports OR operator', async t => {
  const { memorySet, memorySearch } = await setup(t);
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'red sky\nblue ocean\ngreen forest\n',
  });

  const result = await memorySearch.execute({ query: 'red OR blue' });
  t.is(result.results.length, 2);
});

test('memorySearch auto-expands plain words to prefix queries', async t => {
  const { memorySet, memorySearch } = await setup(t);
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'configuration settings\n',
  });

  // "config" should match "configuration" via auto-prefix expansion.
  const result = await memorySearch.execute({ query: 'config' });
  t.is(result.results.length, 1);
  t.true(result.results[0].content.includes('configuration'));
});

test('memorySearch ranks by BM25 relevance', async t => {
  const { memorySet, memorySearch } = await setup(t);
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'apple banana cherry\norange grape melon\n',
  });
  await memorySet.execute({
    path: 'memory/dense.md',
    content: 'apple apple apple\n',
  });

  const result = await memorySearch.execute({ query: 'apple' });
  // The line with higher term frequency should rank first.
  t.is(result.results[0].file, 'memory/dense.md');
});

// ---------------------------------------------------------------------------
// Re-indexing after memorySet overwrites
// ---------------------------------------------------------------------------

test('overwriting a file re-indexes it for search', async t => {
  const { memorySet, memorySearch } = await setup(t);
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'old content about cats\n',
  });

  let result = await memorySearch.execute({ query: 'cats' });
  t.is(result.results.length, 1);

  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'new content about dogs\n',
  });

  result = await memorySearch.execute({ query: 'cats' });
  t.is(result.results.length, 0);

  result = await memorySearch.execute({ query: 'dogs' });
  t.is(result.results.length, 1);
});

test('appending to a file re-indexes the full content', async t => {
  const { memorySet, memorySearch } = await setup(t);
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'initial line\n',
  });
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'appended line\n',
    append: true,
  });

  const result = await memorySearch.execute({ query: 'initial' });
  t.is(result.results.length, 1);

  const result2 = await memorySearch.execute({ query: 'appended' });
  t.is(result2.results.length, 1);
});

// ---------------------------------------------------------------------------
// Invalid FTS5 syntax falls back gracefully
// ---------------------------------------------------------------------------

test('invalid FTS5 syntax falls back without throwing', async t => {
  const { memorySet, memorySearch } = await setup(t);
  await memorySet.execute({
    path: 'MEMORY.md',
    content: 'hello world\n',
  });

  // Unbalanced quotes would be invalid FTS5 syntax.
  const result = await memorySearch.execute({ query: 'hello"' });
  t.true(Array.isArray(result.results));
});

// ---------------------------------------------------------------------------
// Path safety (same as substring backend)
// ---------------------------------------------------------------------------

test('path traversal is rejected', async t => {
  const { memoryGet } = await setup(t);
  const err = await t.throwsAsync(() =>
    memoryGet.execute({ path: '../../../etc/passwd' }),
  );
  t.truthy(err);
  t.true(
    /** @type {Error} */ (err).message.includes('must resolve under root'),
  );
});

test('null bytes in path are rejected', async t => {
  const { memoryGet } = await setup(t);
  const err = await t.throwsAsync(() =>
    memoryGet.execute({ path: 'foo\0bar' }),
  );
  t.truthy(err);
  t.true(
    /** @type {Error} */ (err).message.includes('null bytes'),
  );
});
