import test from '@endo/ses-ava/prepare-endo.js';
import { makeFormulaGraph } from '../src/graph.js';

const makeTestGraph = () => {
  /** @type {string[]} */
  const collected = [];
  const graph = makeFormulaGraph({
    extractLabeledDeps: formula => {
      if (formula.deps) return formula.deps.map(d => [d.label, d.target]);
      return [];
    },
    isLocalId: () => true,
    onCollect: ids => {
      collected.push(...ids);
    },
  });
  return { graph, collected };
};

test('pinTransient prevents collection', t => {
  const { graph, collected } = makeTestGraph();

  graph.onFormulaAdded('petStore:node', { type: 'pet-store', deps: [] });
  graph.onFormulaAdded('directory:node', {
    type: 'directory',
    deps: [{ label: 'petStore', target: 'petStore:node' }],
  });
  graph.pinTransient('directory:node');
  t.deepEqual(collected, []);

  graph.unpinTransient('directory:node');
  // directory should be collected (no other refs)
  t.true(collected.includes('directory:node'));
  // petStore should also cascade
  t.true(collected.includes('petStore:node'));
});

test('double pin survives one unpin', t => {
  const { graph, collected } = makeTestGraph();

  graph.onFormulaAdded('petStore:node', { type: 'pet-store', deps: [] });
  graph.onFormulaAdded('directory:node', {
    type: 'directory',
    deps: [{ label: 'petStore', target: 'petStore:node' }],
  });
  graph.pinTransient('directory:node');
  graph.pinTransient('directory:node');
  t.deepEqual(collected, []);

  graph.unpinTransient('directory:node');
  t.deepEqual(collected, [], 'should still be pinned');

  graph.unpinTransient('directory:node');
  t.true(
    collected.includes('directory:node'),
    'should be collected after both unpins',
  );
});

test('handle-agent union does not trigger premature collection', t => {
  const { graph, collected } = makeTestGraph();

  // Simulate: create handle (which refs guestId that doesn't exist yet)
  graph.onFormulaAdded('handle:guestnode', {
    type: 'handle',
    agent: 'guest:guestnode',
    deps: [{ label: 'agent', target: 'guest:guestnode' }],
  });
  // handle and guest should be unioned
  t.is(graph.findGroup('handle:guestnode'), graph.findGroup('guest:guestnode'));

  // Nothing collected yet (addingFormula guard)
  t.deepEqual(collected, []);

  // Pin the handle
  graph.pinTransient('handle:guestnode');
  t.deepEqual(collected, []);

  // Now create the guest formula
  graph.onFormulaAdded('guest:guestnode', {
    type: 'guest',
    handle: 'handle:guestnode',
    deps: [
      { label: 'handle', target: 'handle:guestnode' },
      { label: 'petStore', target: 'store:guestnode' },
    ],
  });
  // Ensure petStore exists
  graph.onFormulaAdded('store:guestnode', { type: 'pet-store', deps: [] });
  graph.pinTransient('store:guestnode');

  t.deepEqual(collected, []);

  // Unpin handle
  graph.unpinTransient('handle:guestnode');
  // Group still alive because guest+handle are in same group, and
  // the group has ref count from the pin on handle (but handle's pin
  // was just removed... let's check)
  // Actually, after unpin, the group has ref count 0 (no roots, no external refs)
  // except if store's dep keeps guest alive... but store is a DEP OF guest, not the other way.
  // So guest group has no incoming edges. It should be collected.
  // But that's the correct behavior! The guest was only kept alive by the transient pin.

  // Let me also pin the store
  graph.unpinTransient('store:guestnode');
  // Now store is collected too.
  t.true(collected.length > 0, 'formulas should be collected');
});

test('full guest formulation pattern does not collect prematurely', t => {
  const { graph, collected } = makeTestGraph();

  // Simulate formulateEndo: create host and root it.
  // Host's deps:
  graph.onFormulaAdded('hostStore:hostnode', { type: 'pet-store', deps: [] });
  graph.pinTransient('hostStore:hostnode');
  graph.onFormulaAdded('hostMailbox:hostnode', {
    type: 'mailbox-store',
    deps: [],
  });
  graph.pinTransient('hostMailbox:hostnode');
  graph.onFormulaAdded('hostWorker:hostnode', { type: 'worker', deps: [] });
  graph.pinTransient('hostWorker:hostnode');
  graph.onFormulaAdded('hostHandle:hostnode', {
    type: 'handle',
    agent: 'host:hostnode',
    deps: [{ label: 'agent', target: 'host:hostnode' }],
  });
  graph.pinTransient('hostHandle:hostnode');

  // Create host formula
  graph.onFormulaAdded('host:hostnode', {
    type: 'host',
    handle: 'hostHandle:hostnode',
    deps: [
      { label: 'handle', target: 'hostHandle:hostnode' },
      { label: 'petStore', target: 'hostStore:hostnode' },
      { label: 'mailbox', target: 'hostMailbox:hostnode' },
      { label: 'worker', target: 'hostWorker:hostnode' },
    ],
  });

  // Store host pet name in endo store
  graph.onFormulaAdded('endoStore:local', { type: 'pet-store', deps: [] });
  graph.onPetStoreWrite('endoStore:local', 'host:hostnode');

  // Create endo formula and root it
  graph.onFormulaAdded('endo:local', {
    type: 'endo',
    deps: [{ label: 'host', target: 'host:hostnode' }],
  });
  graph.addRoot('endo:local');
  graph.addRoot('endoStore:local');

  t.deepEqual(collected, [], 'nothing collected after endo setup');

  // Now simulate provideGuest:
  // Guest deps:
  graph.onFormulaAdded('guestHandle:guestnode', {
    type: 'handle',
    agent: 'guest:guestnode',
    deps: [{ label: 'agent', target: 'guest:guestnode' }],
  });
  graph.pinTransient('guestHandle:guestnode');

  graph.onFormulaAdded('guestStore:guestnode', { type: 'pet-store', deps: [] });
  graph.pinTransient('guestStore:guestnode');

  graph.onFormulaAdded('guestWorker:guestnode', { type: 'worker', deps: [] });
  graph.pinTransient('guestWorker:guestnode');

  // Deferred tasks: store names in host's pet store
  graph.onPetStoreWrite('hostStore:hostnode', 'guestHandle:guestnode');
  graph.onPetStoreWrite('hostStore:hostnode', 'guest:guestnode');

  // Create guest formula
  graph.onFormulaAdded('guest:guestnode', {
    type: 'guest',
    handle: 'guestHandle:guestnode',
    deps: [
      { label: 'handle', target: 'guestHandle:guestnode' },
      { label: 'petStore', target: 'guestStore:guestnode' },
      { label: 'worker', target: 'guestWorker:guestnode' },
      { label: 'hostAgent', target: 'host:hostnode' },
    ],
  });

  t.deepEqual(collected, [], 'nothing collected after guest creation');

  // Unpin all guest deps
  graph.unpinTransient('guestHandle:guestnode');
  graph.unpinTransient('guestStore:guestnode');
  graph.unpinTransient('guestWorker:guestnode');

  t.deepEqual(collected, [], 'nothing collected after unpinning guest deps');

  // Now remove the guest pet name — should trigger collection
  graph.onPetStoreRemove('hostStore:hostnode', 'guestHandle:guestnode');
  graph.onPetStoreRemove('hostStore:hostnode', 'guest:guestnode');

  t.true(collected.includes('guest:guestnode'), 'guest should be collected');
  t.true(
    collected.includes('guestHandle:guestnode'),
    'handle should be collected',
  );
  t.true(
    collected.includes('guestWorker:guestnode'),
    'worker should be collected',
  );
  t.true(
    collected.includes('guestStore:guestnode'),
    'store should be collected',
  );
});

test('directory with pet-store survives when parent has dep edge', t => {
  const { graph, collected } = makeTestGraph();

  // Create the directory's backing pet store
  graph.onFormulaAdded('dirPetStore:node', { type: 'pet-store', deps: [] });
  // Create the directory
  graph.onFormulaAdded('directory:node', {
    type: 'directory',
    deps: [{ label: 'petStore', target: 'dirPetStore:node' }],
  });
  // Pin directory (like formulateDirectory does)
  graph.pinTransient('directory:node');

  // Create a guest that depends on the directory
  graph.onFormulaAdded('guest:guestnode', {
    type: 'guest',
    handle: 'guestHandle:guestnode',
    deps: [{ label: 'networks', target: 'directory:node' }],
  });
  // Create the handle
  graph.onFormulaAdded('guestHandle:guestnode', {
    type: 'handle',
    agent: 'guest:guestnode',
    deps: [{ label: 'agent', target: 'guest:guestnode' }],
  });

  // Root the guest via a pet store name
  graph.addRoot('guestHandle:guestnode');

  t.deepEqual(collected, []);

  // Now unpin the directory. It should survive because guest depends on it.
  graph.unpinTransient('directory:node');
  t.deepEqual(
    collected,
    [],
    'directory should survive because guest depends on it',
  );
});
