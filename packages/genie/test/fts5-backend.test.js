// @ts-check

/**
 * Tests for the FTS5 search backend.
 */

import './setup.js';

import test from 'ava';
import { makeFTS5Backend } from '../src/tools/fts5-backend.js';

/**
 * Create an in-memory FTS5 backend and register teardown.
 *
 * @param {import('ava').ExecutionContext} t
 * @returns {import('../src/tools/memory.js').SearchBackend}
 */
const createBackend = t => {
  const backend = makeFTS5Backend();
  t.teardown(async () => {
    await backend.sync();
  });
  return backend;
};

// ─── Indexing and basic search ──────────────────────────────────

test('indexes a document and finds it by keyword', async t => {
  const backend = createBackend(t);
  await backend.index('notes.md', 'The quick brown fox jumps over the lazy dog');

  const results = await backend.search('fox');
  t.is(results.length, 1);
  t.is(results[0].file, 'notes.md');
  t.is(results[0].line, 1);
  t.true(results[0].content.includes('fox'));
});

test('returns file, line, and content fields', async t => {
  const backend = createBackend(t);
  await backend.index('multi.md', 'first line\nsecond line\nthird line');

  const results = await backend.search('second');
  t.is(results.length, 1);
  t.is(results[0].file, 'multi.md');
  t.is(results[0].line, 2);
  t.is(results[0].content, 'second line');
});

// ─── Porter stemming ────────────────────────────────────────────

test('Porter stemming matches inflected forms', async t => {
  const backend = createBackend(t);
  await backend.index('verbs.md', 'The runners were running quickly');

  const results = await backend.search('run');
  t.is(results.length, 1);
  t.true(results[0].content.includes('running'));
});

// ─── BM25 ranking ───────────────────────────────────────────────

test('results are ranked by BM25 relevance', async t => {
  const backend = createBackend(t);
  await backend.index(
    'a.md',
    'apple banana cherry\norange grape melon',
  );
  await backend.index('b.md', 'apple apple apple');

  const results = await backend.search('apple');
  // The document with higher term frequency should rank first.
  t.is(results[0].file, 'b.md');
});

// ─── Prefix queries ─────────────────────────────────────────────

test('prefix queries match partial words', async t => {
  const backend = createBackend(t);
  await backend.index('tech.md', 'JavaScript and TypeScript are popular');

  const results = await backend.search('java*');
  t.is(results.length, 1);
  t.true(results[0].content.includes('JavaScript'));
});

// ─── Phrase queries ─────────────────────────────────────────────

test('quoted phrases match exact sequences', async t => {
  const backend = createBackend(t);
  await backend.index(
    'doc.md',
    'the brown fox\nthe quick brown fox\nbrown fox quick',
  );

  const results = await backend.search('"quick brown fox"');
  t.is(results.length, 1);
  t.is(results[0].line, 2);
});

// ─── Boolean operators ──────────────────────────────────────────

test('NOT operator excludes terms', async t => {
  const backend = createBackend(t);
  await backend.index('food.md', 'apple pie\ncherry pie\napple sauce');

  const results = await backend.search('apple NOT pie');
  t.is(results.length, 1);
  t.true(results[0].content.includes('sauce'));
});

test('OR operator broadens matches', async t => {
  const backend = createBackend(t);
  await backend.index('colors.md', 'red sky\nblue ocean\ngreen forest');

  const results = await backend.search('red OR blue');
  t.is(results.length, 2);
});

// ─── Limit ──────────────────────────────────────────────────────

test('respects the limit option', async t => {
  const backend = createBackend(t);
  const lines = Array.from({ length: 20 }, (_, i) => `item number ${i + 1}`);
  await backend.index('many.md', lines.join('\n'));

  const results = await backend.search('item', { limit: 3 });
  t.is(results.length, 3);
});

// ─── Re-indexing ────────────────────────────────────────────────

test('re-indexing replaces previous content', async t => {
  const backend = createBackend(t);
  await backend.index('evolve.md', 'old content about cats');

  let results = await backend.search('cats');
  t.is(results.length, 1);

  await backend.index('evolve.md', 'new content about dogs');

  results = await backend.search('cats');
  t.is(results.length, 0);

  results = await backend.search('dogs');
  t.is(results.length, 1);
});

// ─── Remove ─────────────────────────────────────────────────────

test('remove deletes all rows for a file', async t => {
  const backend = createBackend(t);
  await backend.index('tmp.md', 'ephemeral data here');

  let results = await backend.search('ephemeral');
  t.is(results.length, 1);

  await backend.remove('tmp.md');

  results = await backend.search('ephemeral');
  t.is(results.length, 0);
});

// ─── Empty / edge cases ─────────────────────────────────────────

test('empty query returns no results', async t => {
  const backend = createBackend(t);
  await backend.index('stuff.md', 'some content');

  const results = await backend.search('');
  t.is(results.length, 0);
});

test('blank lines are not indexed', async t => {
  const backend = createBackend(t);
  await backend.index('sparse.md', 'line one\n\n\nline four');

  const results = await backend.search('line');
  t.is(results.length, 2);
  t.is(results[0].line, 1);
  t.is(results[1].line, 4);
});

// ─── Automatic prefix expansion ─────────────────────────────────

test('plain words are auto-expanded to prefix queries', async t => {
  const backend = createBackend(t);
  await backend.index('terms.md', 'configuration settings');

  // "config" should match "configuration" via auto-prefix expansion.
  const results = await backend.search('config');
  t.is(results.length, 1);
  t.true(results[0].content.includes('configuration'));
});

// ─── Invalid FTS5 syntax falls back gracefully ──────────────────

test('invalid FTS5 syntax falls back to phrase search', async t => {
  const backend = createBackend(t);
  await backend.index('safe.md', 'hello world');

  // Unbalanced quotes would be invalid FTS5 syntax.
  const results = await backend.search('hello"');
  // Should not throw; returns results or empty.
  t.true(Array.isArray(results));
});
