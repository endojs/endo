import test from '@endo/ses-ava/prepare-endo.js';

import { makeLocalStoreController } from '../src/store-controller.js';

/** @typedef {import('../src/types.js').FormulaIdentifier} FormulaIdentifier */

const id = /** @param {string} s @returns {FormulaIdentifier} */ s =>
  /** @type {FormulaIdentifier} */ (s);

const makeMockPetStore = () => {
  /** @type {Map<string, string>} */
  const entries = new Map();
  return harden({
    has: name => entries.has(name),
    identifyLocal: name => entries.get(name),
    list: () => [...entries.keys()],
    reverseIdentify: targetId =>
      [...entries.entries()].filter(([, v]) => v === targetId).map(([k]) => k),
    storeIdentifier: async (name, formulaId) => {
      entries.set(name, formulaId);
    },
    remove: async name => {
      entries.delete(name);
    },
    rename: async (from, to) => {
      const val = entries.get(from);
      entries.delete(from);
      if (val !== undefined) entries.set(to, val);
    },
    followNameChanges: () =>
      (async function* noNames() {
        yield* [];
      })(),
    followIdNameChanges: () =>
      (async function* noIdNames() {
        yield* [];
      })(),
    // Expose entries for test assertions.
    testEntries: entries,
  });
};

const makeMockGcHooks = () => {
  const writes = [];
  const removes = [];
  return {
    hooks: harden({
      onPetStoreWrite: (storeId, formulaId) => {
        writes.push({ storeId, formulaId });
      },
      onPetStoreRemove: (storeId, formulaId) => {
        removes.push({ storeId, formulaId });
      },
      isLocalId: () => true,
      withFormulaGraphLock: async fn => fn(),
    }),
    writes,
    removes,
  };
};

test('has delegates to petStore', t => {
  const store = makeMockPetStore();
  const { hooks } = makeMockGcHooks();
  const ctrl = makeLocalStoreController(id('store:node'), store, hooks);

  store.testEntries.set('foo', id('a:node'));
  t.true(ctrl.has('foo'));
  t.false(ctrl.has('bar'));
});

test('identifyLocal delegates to petStore', t => {
  const store = makeMockPetStore();
  const { hooks } = makeMockGcHooks();
  const ctrl = makeLocalStoreController(id('store:node'), store, hooks);

  store.testEntries.set('x', id('b:node'));
  t.is(ctrl.identifyLocal('x'), id('b:node'));
  t.is(ctrl.identifyLocal('missing'), undefined);
});

test('list delegates to petStore', t => {
  const store = makeMockPetStore();
  const { hooks } = makeMockGcHooks();
  const ctrl = makeLocalStoreController(id('store:node'), store, hooks);

  store.testEntries.set('a', id('1:node'));
  store.testEntries.set('b', id('2:node'));
  t.deepEqual(ctrl.list(), ['a', 'b']);
});

test('storeIdentifier writes to store and registers GC edge', async t => {
  const store = makeMockPetStore();
  const { hooks, writes } = makeMockGcHooks();
  const ctrl = makeLocalStoreController(id('store:node'), store, hooks);

  await ctrl.storeIdentifier('myval', id('val:node'));
  t.is(store.testEntries.get('myval'), id('val:node'));
  t.is(writes.length, 1);
  t.is(writes[0].formulaId, id('val:node'));
});

test('storeIdentifier removes GC edge for overwritten id', async t => {
  const store = makeMockPetStore();
  const { hooks, removes } = makeMockGcHooks();
  const ctrl = makeLocalStoreController(id('store:node'), store, hooks);

  store.testEntries.set('name', id('old:node'));
  await ctrl.storeIdentifier('name', id('new:node'));

  // old:node is no longer referenced by any name → GC edge removed.
  t.is(removes.length, 1);
  t.is(removes[0].formulaId, id('old:node'));
});

test('storeLocator throws', async t => {
  const store = makeMockPetStore();
  const { hooks } = makeMockGcHooks();
  const ctrl = makeLocalStoreController(id('store:node'), store, hooks);

  await t.throwsAsync(() => ctrl.storeLocator('x', 'endo://foo/bar'), {
    message: /not supported on local stores/,
  });
});

test('remove deletes from store and cleans up GC edge', async t => {
  const store = makeMockPetStore();
  const { hooks, removes } = makeMockGcHooks();
  const ctrl = makeLocalStoreController(id('store:node'), store, hooks);

  store.testEntries.set('gone', id('orphan:node'));
  await ctrl.remove('gone');

  t.false(store.testEntries.has('gone'));
  t.is(removes.length, 1);
  t.is(removes[0].formulaId, id('orphan:node'));
});

test('rename updates store and handles GC edges', async t => {
  const store = makeMockPetStore();
  const { hooks, writes } = makeMockGcHooks();
  const ctrl = makeLocalStoreController(id('store:node'), store, hooks);

  store.testEntries.set('old-name', id('val:node'));
  await ctrl.rename('old-name', 'new-name');

  t.false(store.testEntries.has('old-name'));
  t.is(store.testEntries.get('new-name'), id('val:node'));
  // Re-registers the moved ID's GC edge under the store.
  t.true(writes.some(w => w.formulaId === id('val:node')));
});

test('seedGcEdges registers all local IDs', async t => {
  const store = makeMockPetStore();
  const { hooks, writes } = makeMockGcHooks();
  const ctrl = makeLocalStoreController(id('store:node'), store, hooks);

  store.testEntries.set('a', id('1:node'));
  store.testEntries.set('b', id('2:node'));

  await ctrl.seedGcEdges();
  t.is(writes.length, 2);
  t.true(writes.some(w => w.formulaId === id('1:node')));
  t.true(writes.some(w => w.formulaId === id('2:node')));
});
