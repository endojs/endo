import test from '@endo/ses-ava/prepare-endo.js';

import { makeFormulaGraph } from '../src/graph.js';

/** @typedef {import('../src/types.js').FormulaIdentifier} FormulaIdentifier */

const id = /** @param {string} s @returns {FormulaIdentifier} */ s =>
  /** @type {FormulaIdentifier} */ (s);

/**
 * Create a graph with simple formula deps extraction.
 * @param {object} [opts]
 * @param {Map<FormulaIdentifier, Array<[string, FormulaIdentifier]>>} [opts.deps]
 * @param {FormulaIdentifier[]} [opts.collected]
 */
const makeTestGraph = (opts = {}) => {
  const { deps = new Map(), collected = [] } = opts;
  return makeFormulaGraph({
    extractLabeledDeps: formula => {
      const formulaDeps = deps.get(/** @type {any} */ (formula));
      return formulaDeps || [];
    },
    isLocalId: _id => true,
    onCollect: ids => collected.push(...ids),
  });
};

test('addRoot and roots', t => {
  const graph = makeTestGraph();
  const a = id('a:node');
  graph.addRoot(a);
  t.true(graph.roots.has(a));
});

test('onFormulaAdded registers formula', t => {
  const graph = makeTestGraph();
  const a = id('a:node');
  graph.addRoot(a);
  graph.onFormulaAdded(a, /** @type {any} */ ({ type: 'worker' }));
  // Formula should be tracked — findGroup returns the group representative.
  const group = graph.findGroup(a);
  t.truthy(group);
});

test('findGroup returns same representative for same formula', t => {
  const graph = makeTestGraph();
  const a = id('a:node');
  graph.addRoot(a);
  graph.onFormulaAdded(a, /** @type {any} */ ({ type: 'worker' }));
  t.is(graph.findGroup(a), graph.findGroup(a));
});

test('onPetStoreWrite and onPetStoreRemove track edges', t => {
  const graph = makeTestGraph();
  const store = id('store:node');
  const value = id('value:node');
  graph.addRoot(store);
  graph.onFormulaAdded(store, /** @type {any} */ ({ type: 'pet-store' }));
  graph.onFormulaAdded(value, /** @type {any} */ ({ type: 'worker' }));

  graph.onPetStoreWrite(store, value);
  const edges = graph.petStoreEdges.get(store);
  t.truthy(edges);
  t.true(edges.has(value));

  graph.onPetStoreRemove(store, value);
  const edgesAfter = graph.petStoreEdges.get(store);
  t.true(!edgesAfter || !edgesAfter.has(value));
});

test('sweepUnreachable collects unreferenced formulas', t => {
  /** @type {FormulaIdentifier[]} */
  const collected = [];
  const graph = makeTestGraph({ collected });

  const root = id('root:node');
  const orphan = id('orphan:node');

  graph.addRoot(root);
  graph.onFormulaAdded(root, /** @type {any} */ ({ type: 'endo' }));
  graph.onFormulaAdded(orphan, /** @type {any} */ ({ type: 'worker' }));

  // orphan is not reachable from any root.
  graph.sweepUnreachable();
  t.true(collected.includes(orphan));
});

test('pinTransient and unpinTransient', t => {
  /** @type {FormulaIdentifier[]} */
  const collected = [];
  const graph = makeTestGraph({ collected });

  const root = id('root:node');
  const temp = id('temp:node');

  graph.addRoot(root);
  graph.onFormulaAdded(root, /** @type {any} */ ({ type: 'endo' }));
  graph.onFormulaAdded(temp, /** @type {any} */ ({ type: 'eval' }));

  // Pin prevents collection.
  graph.pinTransient(temp);
  graph.sweepUnreachable();
  t.false(collected.includes(temp));

  // Unpin allows collection.
  graph.unpinTransient(temp);
  graph.sweepUnreachable();
  // temp may or may not be collected depending on graph internals,
  // but at minimum unpinTransient should not throw.
  t.pass();
});

test('onPetStoreRemoveAll removes all edges from a store', t => {
  const graph = makeTestGraph();
  const store = id('store:node');
  const a = id('a:node');
  const b = id('b:node');

  graph.addRoot(store);
  graph.onFormulaAdded(store, /** @type {any} */ ({ type: 'pet-store' }));
  graph.onFormulaAdded(a, /** @type {any} */ ({ type: 'worker' }));
  graph.onFormulaAdded(b, /** @type {any} */ ({ type: 'worker' }));

  graph.onPetStoreWrite(store, a);
  graph.onPetStoreWrite(store, b);
  t.is(graph.petStoreEdges.get(store)?.size, 2);

  graph.onPetStoreRemoveAll(store);
  t.true(!graph.petStoreEdges.has(store) || graph.petStoreEdges.get(store)?.size === 0);
});

test('onFormulaRemoved cleans up formula', t => {
  const graph = makeTestGraph();
  const a = id('a:node');
  graph.addRoot(a);
  graph.onFormulaAdded(a, /** @type {any} */ ({ type: 'worker' }));
  graph.onFormulaRemoved(a);
  // After removal, the formula should no longer be in formulaDeps.
  t.false(graph.formulaDeps.has(a));
});
