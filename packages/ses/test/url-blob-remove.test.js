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

test('url instanceof URL holds in the start and child compartments under remove', t => {
  if (!hasURL) {
    t.pass('host does not provide URL');
    return;
  }
  // Under `remove` the split collapses onto the single tamed `%SharedURL%`,
  // whose prototype is the host `URL.prototype` with its `constructor` re-
  // pointed at the tamed binding (never the feral host constructor). An
  // instance minted on either side must therefore satisfy `instanceof URL`
  // on both sides, and its `constructor` must resolve to that one shared
  // binding.
  const c = new Compartment();

  const startInstance = new URL('http://example.com/');
  t.true(startInstance instanceof URL);
  t.true(c.evaluate('u => u instanceof URL')(startInstance));

  const childInstance = c.evaluate('new URL("http://example.com/")');
  t.true(childInstance instanceof URL);
  t.true(c.evaluate('u => u instanceof URL')(childInstance));

  // The prototype's constructor is the shared tamed binding, identical across
  // the boundary, so reaching it from an instance never recovers the feral
  // host constructor.
  t.is(globalThis.URL.prototype.constructor, globalThis.URL);
  t.is(startInstance.constructor, globalThis.URL);
  t.is(childInstance.constructor, globalThis.URL);
});

test('round-trip URL parsing still works under remove', t => {
  if (!hasURL) {
    t.pass('host does not provide URL');
    return;
  }
  t.is(new URL('http://example.com/a?b=1').searchParams.get('b'), '1');
});
