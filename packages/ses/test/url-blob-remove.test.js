/* global globalThis */

// Exercises the `urlBlobTaming: 'remove'` lockdown opt-in, which collapses
// the %URL% / %SharedURL% split: the start compartment also receives the
// tamed constructor, the blob-registry statics are removed everywhere, and a
// single `URL` binding is shared by every compartment.

import '../index.js';
import test from 'ava';

const hasURL = typeof globalThis.URL === 'function';

lockdown({ urlBlobTaming: 'remove' });

test('the blob methods are removed from the start compartment', t => {
  if (!hasURL) {
    t.pass('host does not provide URL');
    return;
  }
  t.is(typeof globalThis.URL, 'function');
  t.false('createObjectURL' in globalThis.URL);
  t.false('revokeObjectURL' in globalThis.URL);
});

test('the start and shared compartments share one URL binding', t => {
  if (!hasURL) {
    t.pass('host does not provide URL');
    return;
  }
  const c = new Compartment();
  t.is(c.globalThis.URL, globalThis.URL);
  t.false('createObjectURL' in c.globalThis.URL);
});

test('round-trip URL parsing still works under remove', t => {
  if (!hasURL) {
    t.pass('host does not provide URL');
    return;
  }
  t.is(new URL('http://example.com/a?b=1').searchParams.get('b'), '1');
});
