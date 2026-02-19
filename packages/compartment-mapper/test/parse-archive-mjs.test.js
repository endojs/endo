import test from 'ava';

import { parseArchiveMjs } from '../src/parse-archive-mjs.js';

const encoder = new TextEncoder();

test('parseArchiveMjs caches results for identical bytes and source URL', t => {
  const bytes = encoder.encode('export const value = 1;');
  const first = parseArchiveMjs(
    bytes,
    './mod.js',
    'file:///tmp/mod.js',
    'file:///tmp/',
  );
  const second = parseArchiveMjs(
    bytes,
    './mod.js',
    'file:///tmp/mod.js',
    'file:///tmp/',
  );

  t.is(first, second);
});

test('parseArchiveMjs cache key includes source URL', t => {
  const bytes = encoder.encode('export const value = 2;');
  const first = parseArchiveMjs(
    bytes,
    './mod.js',
    'file:///tmp/a.js',
    'file:///tmp/',
  );
  const second = parseArchiveMjs(
    bytes,
    './mod.js',
    'file:///tmp/b.js',
    'file:///tmp/',
  );

  t.not(first, second);
});

test('parseArchiveMjs bypasses cache when source maps are requested', t => {
  const bytes = encoder.encode('export const value = 3;');
  const first = parseArchiveMjs(
    bytes,
    './mod.js',
    'file:///tmp/mod.js',
    'file:///tmp/',
    { sourceMapHook: () => {} },
  );
  const second = parseArchiveMjs(
    bytes,
    './mod.js',
    'file:///tmp/mod.js',
    'file:///tmp/',
    { sourceMapHook: () => {} },
  );

  t.not(first, second);
});
