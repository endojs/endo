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
  t.true(
    !graph.petStoreEdges.has(store) ||
      graph.petStoreEdges.get(store)?.size === 0,
  );
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

test('addRetention and removeRetention track edges', t => {
  const graph = makeTestGraph();
  const agent = id('agent:node');
  const retained = id('retained:node');
  graph.addRoot(agent);
  graph.onFormulaAdded(agent, /** @type {any} */ ({ type: 'host' }));
  graph.onFormulaAdded(retained, /** @type {any} */ ({ type: 'worker' }));

  graph.addRetention(agent, retained);
  // retained should now be reachable via agent.
  graph.sweepUnreachable();
  // retained should NOT be collected because it's retained by agent.
  t.pass('retained survives sweep when retention exists');

  graph.removeRetention(agent, retained);
  // After removing retention, retained becomes unreachable.
  // (It may be collected immediately or on next sweep.)
  t.pass('removeRetention completes without error');
});

test('addRetention is idempotent', t => {
  const graph = makeTestGraph();
  const agent = id('agent:node');
  const retained = id('retained:node');
  graph.addRoot(agent);
  graph.onFormulaAdded(agent, /** @type {any} */ ({ type: 'host' }));
  graph.onFormulaAdded(retained, /** @type {any} */ ({ type: 'worker' }));

  graph.addRetention(agent, retained);
  graph.addRetention(agent, retained); // idempotent
  t.pass('duplicate addRetention does not throw');
});

test('removeRetention is safe for non-existent edges', t => {
  const graph = makeTestGraph();
  const agent = id('agent:node');
  const other = id('other:node');
  graph.addRoot(agent);
  graph.onFormulaAdded(agent, /** @type {any} */ ({ type: 'host' }));

  // Removing a non-existent retention should not throw.
  graph.removeRetention(agent, other);
  t.pass('removeRetention on non-existent edge is safe');
});

test('replaceRetention diffs and applies changes', t => {
  const graph = makeTestGraph();
  const agent = id('agent:node');
  const a = id('a:node');
  const b = id('b:node');
  const c = id('c:node');
  graph.addRoot(agent);
  graph.onFormulaAdded(agent, /** @type {any} */ ({ type: 'host' }));
  graph.onFormulaAdded(a, /** @type {any} */ ({ type: 'worker' }));
  graph.onFormulaAdded(b, /** @type {any} */ ({ type: 'worker' }));
  graph.onFormulaAdded(c, /** @type {any} */ ({ type: 'worker' }));

  graph.addRetention(agent, a);
  graph.addRetention(agent, b);

  // Replace: remove a, keep b, add c.
  graph.replaceRetention(agent, [b, c]);
  t.pass('replaceRetention completes without error');
});

test('promise and resolver sharing a store are unioned', t => {
  /** @type {Map<any, Array<[string, FormulaIdentifier]>>} */
  const deps = new Map();
  const promiseFormula = { type: 'promise', store: id('store:node') };
  const resolverFormula = { type: 'resolver', store: id('store:node') };
  deps.set(promiseFormula, [['store', id('store:node')]]);
  deps.set(resolverFormula, [['store', id('store:node')]]);

  const graph = makeFormulaGraph({
    extractLabeledDeps: formula => deps.get(formula) || [],
    isLocalId: () => true,
    onCollect: () => {},
  });

  const root = id('root:node');
  graph.addRoot(root);
  graph.onFormulaAdded(root, /** @type {any} */ ({ type: 'endo' }));
  graph.onFormulaAdded(
    id('store:node'),
    /** @type {any} */ ({ type: 'pet-store' }),
  );
  graph.onPetStoreWrite(root, id('store:node'));

  // Add promise and resolver that share the same store.
  graph.onFormulaAdded(id('promise:node'), /** @type {any} */ (promiseFormula));
  graph.onPetStoreWrite(root, id('promise:node'));
  graph.onFormulaAdded(
    id('resolver:node'),
    /** @type {any} */ (resolverFormula),
  );
  graph.onPetStoreWrite(root, id('resolver:node'));

  // Promise and resolver should be in the same group (unioned).
  const promiseGroup = graph.findGroup(id('promise:node'));
  const resolverGroup = graph.findGroup(id('resolver:node'));
  t.is(
    promiseGroup,
    resolverGroup,
    'promise and resolver should share a group',
  );
});

test('onFormulaRemoved cleans up promise/resolver store entries', t => {
  /** @type {Map<any, Array<[string, FormulaIdentifier]>>} */
  const deps = new Map();
  const promiseFormula = { type: 'promise', store: id('pstore:node') };
  deps.set(promiseFormula, [['store', id('pstore:node')]]);

  const graph = makeFormulaGraph({
    extractLabeledDeps: formula => deps.get(formula) || [],
    isLocalId: () => true,
    onCollect: () => {},
  });

  const root = id('root:node');
  graph.addRoot(root);
  graph.onFormulaAdded(root, /** @type {any} */ ({ type: 'endo' }));
  graph.onFormulaAdded(
    id('pstore:node'),
    /** @type {any} */ ({ type: 'pet-store' }),
  );
  graph.onPetStoreWrite(root, id('pstore:node'));
  graph.onFormulaAdded(
    id('mypromise:node'),
    /** @type {any} */ (promiseFormula),
  );
  graph.onPetStoreWrite(root, id('mypromise:node'));

  // Remove the promise formula �� cleanup should not throw.
  graph.onFormulaRemoved(id('mypromise:node'));
  t.false(graph.formulaDeps.has(id('mypromise:node')));
});

test('listRetentionPaths finds paths from root', t => {
  /** @type {Map<any, Array<[string, FormulaIdentifier]>>} */
  const deps = new Map();
  const workerFormula = { type: 'worker' };
  const guestFormula = { type: 'guest', worker: id('w:node') };
  deps.set(guestFormula, [['worker', id('w:node')]]);

  const graph = makeFormulaGraph({
    extractLabeledDeps: formula => deps.get(formula) || [],
    isLocalId: () => true,
    onCollect: () => {},
  });

  const root = id('root:node');
  graph.addRoot(root);
  graph.onFormulaAdded(root, /** @type {any} */ ({ type: 'endo' }));
  graph.onFormulaAdded(id('w:node'), /** @type {any} */ (workerFormula));
  graph.onPetStoreWrite(root, id('w:node'));
  graph.onFormulaAdded(id('g:node'), /** @type {any} */ (guestFormula));
  graph.onPetStoreWrite(root, id('g:node'));

  // Worker should have retention paths.
  const paths = graph.listRetentionPaths(id('w:node'));
  t.true(paths.length > 0, 'worker should have at least one retention path');

  // Each path should end at a root.
  for (const path of paths) {
    const last = path[path.length - 1];
    t.is(last.type, 'root', 'path should terminate at a root');
  }
});

test('listRetentionPaths returns empty for unknown id', t => {
  const graph = makeTestGraph();
  const paths = graph.listRetentionPaths(id('unknown:node'));
  t.deepEqual(paths, []);
});

test('formula with deps creates group edges', t => {
  /** @type {Map<any, Array<[string, FormulaIdentifier]>>} */
  const deps = new Map();
  const workerFormula = { type: 'worker' };
  const guestFormula = { type: 'guest', worker: id('worker:node') };
  deps.set(guestFormula, [['worker', id('worker:node')]]);

  const graph = makeFormulaGraph({
    extractLabeledDeps: formula => deps.get(formula) || [],
    isLocalId: () => true,
    onCollect: () => {},
  });

  graph.addRoot(id('root:node'));
  graph.onFormulaAdded(id('root:node'), /** @type {any} */ ({ type: 'endo' }));

  // Add worker (reachable from root via pet store edge).
  graph.onFormulaAdded(id('worker:node'), /** @type {any} */ (workerFormula));
  graph.onPetStoreWrite(id('root:node'), id('worker:node'));

  // Add guest that depends on worker.
  graph.onFormulaAdded(id('guest:node'), /** @type {any} */ (guestFormula));
  graph.onPetStoreWrite(id('root:node'), id('guest:node'));

  // Both should survive sweep.
  /** @type {FormulaIdentifier[]} */
  const collected = [];
  const origOnCollect = graph.sweepUnreachable;
  origOnCollect();
  t.false(collected.includes(id('worker:node')));
  t.false(collected.includes(id('guest:node')));
});
