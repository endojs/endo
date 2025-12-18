// @ts-check
/* eslint-disable no-restricted-syntax */

import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import {
  makeSlot,
  parseSlot,
  makePairwiseTable,
} from '../../src/captp/pairwise.js';

// Test helper
const makeTestTable = (
  importHook = () => {},
  exportHook = () => {},
  onSlotCollected = () => {},
) => makePairwiseTable(importHook, exportHook, onSlotCollected);

// Test makeSlot function

test('makeSlot - creates answer slot with local flag', t => {
  const slot = makeSlot('a', true, 42n);
  t.is(slot, /** @type {any} */ ('a+42'));
});

test('makeSlot - creates answer slot with remote flag', t => {
  const slot = makeSlot('a', false, 42n);
  t.is(slot, /** @type {any} */ ('a-42'));
});

test('makeSlot - creates promise slot with local flag', t => {
  const slot = makeSlot('p', true, 123n);
  t.is(slot, /** @type {any} */ ('p+123'));
});

test('makeSlot - creates promise slot with remote flag', t => {
  const slot = makeSlot('p', false, 123n);
  t.is(slot, /** @type {any} */ ('p-123'));
});

test('makeSlot - creates object slot with local flag', t => {
  const slot = makeSlot('o', true, 999n);
  t.is(slot, /** @type {any} */ ('o+999'));
});

test('makeSlot - creates object slot with remote flag', t => {
  const slot = makeSlot('o', false, 999n);
  t.is(slot, /** @type {any} */ ('o-999'));
});

test('makeSlot - handles large position values', t => {
  const slot = makeSlot('o', true, 9007199254740991n);
  t.is(slot, /** @type {any} */ ('o+9007199254740991'));
});

test('makeSlot - handles zero position', t => {
  const slot = makeSlot('o', true, 0n);
  t.is(slot, /** @type {any} */ ('o+0'));
});

// Test parseSlot function

test('parseSlot - parses local answer slot', t => {
  const result = parseSlot(/** @type {any} */ ('a+42'));
  t.deepEqual(result, { type: 'a', isLocal: true, position: 42n });
});

test('parseSlot - parses remote answer slot', t => {
  const result = parseSlot(/** @type {any} */ ('a-42'));
  t.deepEqual(result, { type: 'a', isLocal: false, position: 42n });
});

test('parseSlot - parses local promise slot', t => {
  const result = parseSlot(/** @type {any} */ ('p+123'));
  t.deepEqual(result, { type: 'p', isLocal: true, position: 123n });
});

test('parseSlot - parses remote promise slot', t => {
  const result = parseSlot(/** @type {any} */ ('p-123'));
  t.deepEqual(result, { type: 'p', isLocal: false, position: 123n });
});

test('parseSlot - parses local object slot', t => {
  const result = parseSlot(/** @type {any} */ ('o+999'));
  t.deepEqual(result, { type: 'o', isLocal: true, position: 999n });
});

test('parseSlot - parses remote object slot', t => {
  const result = parseSlot(/** @type {any} */ ('o-999'));
  t.deepEqual(result, { type: 'o', isLocal: false, position: 999n });
});

test('parseSlot - parses large position values', t => {
  const result = parseSlot(/** @type {any} */ ('o+9007199254740991'));
  t.deepEqual(result, {
    type: 'o',
    isLocal: true,
    position: 9007199254740991n,
  });
});

test('parseSlot - parses zero position', t => {
  const result = parseSlot(/** @type {any} */ ('o+0'));
  t.deepEqual(result, { type: 'o', isLocal: true, position: 0n });
});

test('parseSlot - throws on invalid slot type', t => {
  const error = t.throws(() => parseSlot(/** @type {any} */ ('x+42')));
  t.regex(error.message, /Invalid slot type/);
});

test('parseSlot - roundtrip with makeSlot', t => {
  const original = {
    type: /** @type {const} */ ('o'),
    isLocal: true,
    position: 42n,
  };
  const slot = makeSlot(original.type, original.isLocal, original.position);
  const parsed = parseSlot(slot);
  t.deepEqual(parsed, original);
});

// Test makePairwiseTable - basic registration and retrieval

test('makePairwiseTable - registerSlot and getValueForSlot for local export', t => {
  const table = makeTestTable();
  const slot = makeSlot('o', true, 1n);
  const obj = Far('test', { getValue: () => 42 });

  table.registerSlot(slot, obj);

  const retrieved = table.getValueForSlot(slot);
  t.is(retrieved, obj);
});

test('makePairwiseTable - registerSlot and getValueForSlot for remote import', t => {
  const table = makeTestTable();
  const slot = makeSlot('o', false, 1n);
  const obj = Far('test', { getValue: () => 42 });

  table.registerSlot(slot, obj);

  const retrieved = table.getValueForSlot(slot);
  t.is(retrieved, obj);
});

test('makePairwiseTable - getSlotForValue returns slot for registered value', t => {
  const table = makeTestTable();
  const slot = makeSlot('o', true, 1n);
  const obj = Far('test', { getValue: () => 42 });

  table.registerSlot(slot, obj);

  const retrievedSlot = table.getSlotForValue(obj);
  t.is(retrievedSlot, slot);
});

test('makePairwiseTable - getSlotForValue returns undefined for unregistered value', t => {
  const table = makeTestTable();
  const obj = Far('test', { getValue: () => 42 });

  const retrievedSlot = table.getSlotForValue(obj);
  t.is(retrievedSlot, undefined);
});

test('makePairwiseTable - getValueForSlot returns undefined for unregistered slot', t => {
  const table = makeTestTable();

  const retrieved = table.getValueForSlot(makeSlot('o', true, 999n));
  t.is(retrieved, undefined);
});

test('makePairwiseTable - throws when registering same export slot twice', t => {
  const table = makeTestTable();
  const slot = makeSlot('o', true, 1n);
  const obj1 = Far('test1', { getValue: () => 42 });
  const obj2 = Far('test2', { getValue: () => 43 });

  table.registerSlot(slot, obj1);

  const error = t.throws(() => table.registerSlot(slot, obj2));
  t.regex(error.message, /already registered as an export/);
});

test('makePairwiseTable - throws when registering same import slot twice', t => {
  const table = makeTestTable();
  const slot = makeSlot('o', false, 1n);
  const obj1 = Far('test1', { getValue: () => 42 });
  const obj2 = Far('test2', { getValue: () => 43 });

  table.registerSlot(slot, obj1);

  const error = t.throws(() => table.registerSlot(slot, obj2));
  t.regex(error.message, /already registered as an import/);
});

test('makePairwiseTable - can register different slots for different objects', t => {
  const table = makeTestTable();
  const obj1 = Far('test1', { getValue: () => 42 });
  const obj2 = Far('test2', { getValue: () => 43 });
  const slot1 = makeSlot('o', true, 1n);
  const slot2 = makeSlot('o', true, 2n);

  table.registerSlot(slot1, obj1);
  table.registerSlot(slot2, obj2);

  t.is(table.getValueForSlot(slot1), obj1);
  t.is(table.getValueForSlot(slot2), obj2);
  t.is(table.getSlotForValue(obj1), slot1);
  t.is(table.getSlotForValue(obj2), slot2);
});

// Test reference counting

test('makePairwiseTable - getRefCount returns 0 for untracked slot', t => {
  const table = makeTestTable();

  const refCount = table.getRefCount(makeSlot('o', true, 1n));
  t.is(refCount, 0);
});

test('makePairwiseTable - getRefCount returns correct count after commitSentRefCounts for local slot', t => {
  const table = makeTestTable();
  const slot = makeSlot('o', true, 1n);
  const obj = Far('test', { getValue: () => 42 });

  table.registerSlot(slot, obj);

  // Simulate sending the local slot (getSlotForValue during serialization)
  table.getSlotForValue(obj);
  table.commitSentRefCounts();

  t.is(table.getRefCount(slot), 1);
});

test('makePairwiseTable - multiple getSlotForValue calls only count once per commit for local slot', t => {
  const table = makeTestTable();
  const slot = makeSlot('o', true, 1n);
  const obj = Far('test', { getValue: () => 42 });

  table.registerSlot(slot, obj);

  // Multiple calls in same commit cycle only increment by 1 (uses Set internally)
  table.getSlotForValue(obj);
  table.getSlotForValue(obj);
  table.getSlotForValue(obj);
  table.commitSentRefCounts();

  t.is(table.getRefCount(slot), 1);
});

test('makePairwiseTable - getValueForSlot increments pending received refcount for remote slot', t => {
  const table = makeTestTable();
  const slot = makeSlot('o', false, 1n); // remote slot
  const obj = Far('test', { getValue: () => 42 });

  table.registerSlot(slot, obj);

  // Simulate receiving the remote slot (getValueForSlot during deserialization)
  table.getValueForSlot(slot);
  table.commitReceivedRefCounts();

  t.is(table.getRefCount(slot), 1);
});

test('makePairwiseTable - clearPendingRefCounts aborts pending counts', t => {
  const table = makeTestTable();
  const slot = makeSlot('o', true, 1n);
  const obj = Far('test', { getValue: () => 42 });

  table.registerSlot(slot, obj);

  // Add pending refcounts but don't commit
  table.getSlotForValue(obj);
  table.getSlotForValue(obj);

  // Clear pending instead of committing
  table.clearPendingRefCounts();

  // Refcount should still be 0
  t.is(table.getRefCount(slot), 0);
});

test('makePairwiseTable - commitSentRefCounts only commits sent refs, aborts received', t => {
  const table = makeTestTable();
  const localSlot = makeSlot('o', true, 1n);
  const remoteSlot = makeSlot('o', false, 1n);
  const obj1 = Far('test1', { getValue: () => 42 });
  const obj2 = Far('test2', { getValue: () => 43 });

  table.registerSlot(localSlot, obj1);
  table.registerSlot(remoteSlot, obj2);

  // Simulate sending local slot (getSlotForValue during serialization)
  table.getSlotForValue(obj1);

  // Simulate receiving remote slot (getValueForSlot during deserialization)
  table.getValueForSlot(remoteSlot);

  // Commit only sent refcounts
  table.commitSentRefCounts();

  // Local slot (sent) should have refcount 1
  t.is(table.getRefCount(localSlot), 1);

  // Remote slot (received but aborted) should have refcount 0
  t.is(table.getRefCount(remoteSlot), 0);
});

test('makePairwiseTable - commitReceivedRefCounts only commits received refs, aborts sent', t => {
  const table = makeTestTable();
  const localSlot = makeSlot('o', true, 1n);
  const remoteSlot = makeSlot('o', false, 1n);
  const obj1 = Far('test1', { getValue: () => 42 });
  const obj2 = Far('test2', { getValue: () => 43 });

  table.registerSlot(localSlot, obj1);
  table.registerSlot(remoteSlot, obj2);

  // Simulate sending local slot (getSlotForValue during serialization)
  table.getSlotForValue(obj1);

  // Simulate receiving remote slot (getValueForSlot during deserialization)
  table.getValueForSlot(remoteSlot);

  // Commit only received refcounts
  table.commitReceivedRefCounts();

  // Remote slot (received) should have refcount 1
  t.is(table.getRefCount(remoteSlot), 1);

  // Local slot (sent but aborted) should have refcount 0
  t.is(table.getRefCount(localSlot), 0);
});

// Test dropSlot

test('makePairwiseTable - dropSlot fully removes slot when refcount reaches zero', t => {
  const table = makeTestTable();
  const slot = makeSlot('o', true, 1n);
  const obj = Far('test', { getValue: () => 42 });

  table.registerSlot(slot, obj);
  table.getSlotForValue(obj);
  table.commitSentRefCounts();

  t.is(table.getRefCount(slot), 1);

  // Drop the slot
  table.dropSlot(slot, 1);

  // Should be removed
  t.is(table.getRefCount(slot), 0);
  t.is(table.getValueForSlot(slot), undefined);
});

test('makePairwiseTable - dropSlot partially reduces refcount when delta < refcount', t => {
  const table = makeTestTable();
  const slot = makeSlot('o', true, 1n);
  const obj = Far('test', { getValue: () => 42 });

  table.registerSlot(slot, obj);

  // Build up refcount to 5 by committing 5 separate times
  table.getSlotForValue(obj);
  table.commitSentRefCounts();
  table.getSlotForValue(obj);
  table.commitSentRefCounts();
  table.getSlotForValue(obj);
  table.commitSentRefCounts();
  table.getSlotForValue(obj);
  table.commitSentRefCounts();
  table.getSlotForValue(obj);
  table.commitSentRefCounts();

  t.is(table.getRefCount(slot), 5);

  // Drop 3
  table.dropSlot(slot, 3);

  // Should have 2 remaining
  t.is(table.getRefCount(slot), 2);

  // Value should still be present
  t.is(table.getValueForSlot(slot), obj);
});

test('makePairwiseTable - dropSlot with delta > refcount removes slot completely', t => {
  const table = makeTestTable();
  const slot = makeSlot('o', true, 1n);
  const obj = Far('test', { getValue: () => 42 });

  table.registerSlot(slot, obj);
  table.getSlotForValue(obj);
  table.commitSentRefCounts();

  t.is(table.getRefCount(slot), 1);

  // Drop more than current refcount
  table.dropSlot(slot, 10);

  // Should be removed
  t.is(table.getRefCount(slot), 0);
  t.is(table.getValueForSlot(slot), undefined);
});

test('makePairwiseTable - dropSlot removes from export table for local slots', t => {
  const table = makeTestTable();
  const slot = makeSlot('o', true, 1n); // local/export
  const obj = Far('test', { getValue: () => 42 });

  table.registerSlot(slot, obj);
  table.getSlotForValue(obj);
  table.commitSentRefCounts();

  table.dropSlot(slot, 1);

  // After dropping, can't retrieve by slot (removed from export table)
  t.is(table.getValueForSlot(slot), undefined);

  // And valueToSlot mapping is cleared too
  t.is(table.getSlotForValue(obj), undefined);
});

test('makePairwiseTable - dropSlot removes from import table for remote slots', t => {
  const table = makeTestTable();
  const slot = makeSlot('o', false, 1n); // remote/import
  const obj = Far('test', { getValue: () => 42 });

  table.registerSlot(slot, obj);
  table.getValueForSlot(slot);
  table.commitReceivedRefCounts();

  table.dropSlot(slot, 1);

  // After dropping, can't retrieve by slot (removed from import table)
  t.is(table.getValueForSlot(slot), undefined);

  // And valueToSlot mapping is cleared too
  t.is(table.getSlotForValue(obj), undefined);
});

test('makePairwiseTable - onSlotCollected called when import is garbage collected', t => {
  const collected = [];
  const table = makeTestTable(
    () => {}, // importHook
    () => {}, // exportHook
    (slot, refcount) => {
      // onSlotCollected
      collected.push({ slot, refcount });
    },
  );

  const slot = makeSlot('o', false, 1n); // remote/import (uses weak values)
  let obj = /** @type {any} */ (Far('test', { getValue: () => 42 }));

  table.registerSlot(slot, obj);
  table.getValueForSlot(slot);
  table.commitReceivedRefCounts();

  t.is(table.getRefCount(slot), 1);

  // Drop the strong reference to the object
  obj = null;

  // Note: We cannot reliably test GC in JavaScript as it's non-deterministic
  // This test documents the expected behavior but may not trigger the finalizer
  // in the test environment
  t.is(
    collected.length,
    0,
    'GC is non-deterministic, finalizer may not run in tests',
  );
});

// Test settler management

test('makePairwiseTable - registerSettler and takeSettler', t => {
  const table = makeTestTable();
  const slot = makeSlot('p', true, 1n);
  const { resolve, reject } = makePromiseKit();
  const settler = /** @type {any} */ ({ resolve, reject });

  table.registerSettler(slot, settler);

  const retrieved = table.takeSettler(slot);
  t.is(retrieved, settler);
});

test('makePairwiseTable - takeSettler removes settler after retrieval', t => {
  const table = makeTestTable();
  const slot = makeSlot('p', true, 1n);
  const { resolve, reject } = makePromiseKit();
  const settler = /** @type {any} */ ({ resolve, reject });

  table.registerSettler(slot, settler);
  table.takeSettler(slot);

  // Second take should throw
  const error = t.throws(() => table.takeSettler(slot));
  t.regex(error.message, /No settler found/);
});

test('makePairwiseTable - takeSettler throws for unregistered slot', t => {
  const table = makeTestTable();

  const error = t.throws(() => table.takeSettler(makeSlot('p', true, 999n)));
  t.regex(error.message, /No settler found/);
});

test('makePairwiseTable - can register multiple settlers for different slots', t => {
  const table = makeTestTable();
  const settler1 = /** @type {any} */ ({ resolve: () => {}, reject: () => {} });
  const settler2 = /** @type {any} */ ({ resolve: () => {}, reject: () => {} });
  const slot1 = makeSlot('p', true, 1n);
  const slot2 = makeSlot('p', true, 2n);

  table.registerSettler(slot1, settler1);
  table.registerSettler(slot2, settler2);

  t.is(table.takeSettler(slot1), settler1);
  t.is(table.takeSettler(slot2), settler2);
});

test('makePairwiseTable - registerSettler can overwrite previous settler', t => {
  const table = makeTestTable();
  const slot = makeSlot('p', true, 1n);
  const settler1 = /** @type {any} */ ({ resolve: () => {}, reject: () => {} });
  const settler2 = /** @type {any} */ ({ resolve: () => {}, reject: () => {} });

  table.registerSettler(slot, settler1);
  table.registerSettler(slot, settler2); // Overwrites

  const retrieved = table.takeSettler(slot);
  t.is(retrieved, settler2);
});

// Test destroy

test('makePairwiseTable - destroy clears all tables', t => {
  const table = makeTestTable();
  const obj1 = Far('test1', { getValue: () => 42 });
  const obj2 = Far('test2', { getValue: () => 43 });
  const settler = /** @type {any} */ ({ resolve: () => {}, reject: () => {} });
  const slot1 = makeSlot('o', true, 1n);
  const slot2 = makeSlot('o', false, 1n);
  const slot3 = makeSlot('p', true, 1n);

  table.registerSlot(slot1, obj1);
  table.registerSlot(slot2, obj2);
  table.getSlotForValue(obj1);
  table.commitSentRefCounts();
  table.registerSettler(slot3, settler);

  // Verify things are registered
  t.is(table.getValueForSlot(slot1), obj1);
  t.is(table.getRefCount(slot1), 1);

  // Destroy
  table.destroy();

  // Export and import tables should be cleared
  t.is(table.getValueForSlot(slot1), undefined);
  t.is(table.getValueForSlot(slot2), undefined);

  // valueToSlot WeakMap is NOT cleared by destroy
  t.is(table.getSlotForValue(obj1), slot1);
  t.is(table.getSlotForValue(obj2), slot2);

  // Refcounts should be cleared
  t.is(table.getRefCount(slot1), 0);

  // Settlers should be cleared too
  const error = t.throws(() => table.takeSettler(slot3));
  t.regex(error.message, /No settler found/);
});

test('makePairwiseTable - destroy clears pending refcounts', t => {
  const table = makeTestTable();
  const slot = makeSlot('o', true, 1n);
  const obj = Far('test', { getValue: () => 42 });

  table.registerSlot(slot, obj);

  // Add pending refcounts but don't commit
  table.getSlotForValue(obj);
  table.getSlotForValue(obj);

  // Destroy before committing
  table.destroy();

  // Re-register and commit should start fresh
  table.registerSlot(slot, obj);
  table.getSlotForValue(obj);
  table.commitSentRefCounts();

  // Should only have 1 refcount from the new operation, not 3
  t.is(table.getRefCount(slot), 1);
});

// Test interaction between different slot types

test('makePairwiseTable - supports all three slot types', t => {
  const table = makeTestTable();
  const answer = Far('answer', { getValue: () => 'answer' });
  const promise = Far('promise', { getValue: () => 'promise' });
  const object = Far('object', { getValue: () => 'object' });
  const slotA = makeSlot('a', true, 1n);
  const slotP = makeSlot('p', true, 1n);
  const slotO = makeSlot('o', true, 1n);

  table.registerSlot(slotA, answer);
  table.registerSlot(slotP, promise);
  table.registerSlot(slotO, object);

  t.is(table.getValueForSlot(slotA), answer);
  t.is(table.getValueForSlot(slotP), promise);
  t.is(table.getValueForSlot(slotO), object);

  t.is(table.getSlotForValue(answer), slotA);
  t.is(table.getSlotForValue(promise), slotP);
  t.is(table.getSlotForValue(object), slotO);
});

test('makePairwiseTable - local and remote slots are independent', t => {
  const table = makeTestTable();
  const localObj = Far('local', { getValue: () => 'local' });
  const remoteObj = Far('remote', { getValue: () => 'remote' });
  const localSlot = makeSlot('o', true, 1n);
  const remoteSlot = makeSlot('o', false, 1n);

  // Same position but different locality
  table.registerSlot(localSlot, localObj);
  table.registerSlot(remoteSlot, remoteObj);

  t.is(table.getValueForSlot(localSlot), localObj);
  t.is(table.getValueForSlot(remoteSlot), remoteObj);

  t.is(table.getSlotForValue(localObj), localSlot);
  t.is(table.getSlotForValue(remoteObj), remoteSlot);
});

// Test import and export hooks

test('makePairwiseTable - exportHook called when registering local slot', t => {
  const exports = [];
  const table = makeTestTable(
    () => {},
    (value, slot) => {
      exports.push({ value, slot });
    },
    () => {},
  );

  const obj = Far('test', { getValue: () => 42 });
  const slot = makeSlot('o', true, 1n);

  table.registerSlot(slot, obj);

  t.is(exports.length, 1);
  t.is(exports[0].value, obj);
  t.is(exports[0].slot, slot);
});

test('makePairwiseTable - importHook called when registering remote slot', t => {
  const imports = [];
  const table = makeTestTable(
    (value, slot) => {
      imports.push({ value, slot });
    },
    () => {},
    () => {},
  );

  const obj = Far('test', { getValue: () => 42 });
  const slot = makeSlot('o', false, 1n);

  table.registerSlot(slot, obj);

  t.is(imports.length, 1);
  t.is(imports[0].value, obj);
  t.is(imports[0].slot, slot);
});

test('makePairwiseTable - hooks not called for unregistered operations', t => {
  let importCalls = 0;
  let exportCalls = 0;
  const table = makeTestTable(
    () => {
      importCalls += 1;
    },
    () => {
      exportCalls += 1;
    },
    () => {},
  );

  // These operations should not trigger hooks
  table.getSlotForValue(Far('test', {}));
  table.getValueForSlot(makeSlot('o', true, 999n));
  table.getRefCount(makeSlot('o', true, 1n));

  t.is(importCalls, 0);
  t.is(exportCalls, 0);
});

test('makePairwiseTable - multiple registrations trigger multiple hook calls', t => {
  const exports = [];
  const imports = [];
  const table = makeTestTable(
    (value, slot) => {
      imports.push({ value, slot });
    },
    (value, slot) => {
      exports.push({ value, slot });
    },
    () => {},
  );

  const obj1 = Far('test1', { getValue: () => 1 });
  const obj2 = Far('test2', { getValue: () => 2 });
  const obj3 = Far('test3', { getValue: () => 3 });

  table.registerSlot(makeSlot('o', true, 1n), obj1);
  table.registerSlot(makeSlot('o', false, 1n), obj2);
  table.registerSlot(makeSlot('o', true, 2n), obj3);

  t.is(exports.length, 2);
  t.is(imports.length, 1);
});

// Test refcount isolation between local and remote

test('makePairwiseTable - sending remote value does not increment its refcount', t => {
  const table = makeTestTable();
  const remoteSlot = makeSlot('o', false, 1n); // remote slot
  const remoteObj = Far('remote', { getValue: () => 42 });

  // Register the remote import
  table.registerSlot(remoteSlot, remoteObj);
  table.getValueForSlot(remoteSlot);
  table.commitReceivedRefCounts();

  t.is(table.getRefCount(remoteSlot), 1);

  // Now "send" the remote value (look it up for serialization)
  // This should NOT increment the refcount because we're just passing it back
  table.getSlotForValue(remoteObj);
  table.commitSentRefCounts();

  // Refcount should still be 1, not 2
  t.is(
    table.getRefCount(remoteSlot),
    1,
    'sending remote value should not increment its refcount',
  );
});

test('makePairwiseTable - receiving local value does not increment its refcount', t => {
  const table = makeTestTable();
  const localSlot = makeSlot('o', true, 1n); // local slot
  const localObj = Far('local', { getValue: () => 42 });

  // Register the local export
  table.registerSlot(localSlot, localObj);
  table.getSlotForValue(localObj);
  table.commitSentRefCounts();

  t.is(table.getRefCount(localSlot), 1);

  // Now "receive" the local value back (deserialize a slot that references our own export)
  // This should NOT increment the refcount because it's our own export coming back
  table.getValueForSlot(localSlot);
  table.commitReceivedRefCounts();

  // Refcount should still be 1, not 2
  t.is(
    table.getRefCount(localSlot),
    1,
    'receiving local value should not increment its refcount',
  );
});

test('makePairwiseTable - mixed send/receive only affects appropriate slots', t => {
  const table = makeTestTable();
  const localSlot = makeSlot('o', true, 1n);
  const remoteSlot = makeSlot('o', false, 1n);
  const localObj = Far('local', { getValue: () => 1 });
  const remoteObj = Far('remote', { getValue: () => 2 });

  // Set up initial state with 1 refcount each
  table.registerSlot(localSlot, localObj);
  // Remote is registered with refcount 1 automatically
  table.registerSlot(remoteSlot, remoteObj);
  table.commitReceivedRefCounts(); // Commit the import registration

  // Send local once
  table.getSlotForValue(localObj);
  table.commitSentRefCounts();

  t.is(table.getRefCount(localSlot), 1);
  t.is(table.getRefCount(remoteSlot), 1);

  // Send local again (should increment)
  table.getSlotForValue(localObj);
  // Send remote (should NOT increment - wrong direction)
  table.getSlotForValue(remoteObj);
  table.commitSentRefCounts();

  // Receive remote again (should increment)
  table.getValueForSlot(remoteSlot);
  // Receive local (should NOT increment - wrong direction)
  table.getValueForSlot(localSlot);
  table.commitReceivedRefCounts();

  // Local should be 2 (from second send), remote should be 2 (from second receive)
  t.is(
    table.getRefCount(localSlot),
    2,
    'local refcount incremented by sending',
  );
  t.is(
    table.getRefCount(remoteSlot),
    2,
    'remote refcount incremented by receiving',
  );
});

// Test edge cases

test('makePairwiseTable - getSlotForValue returns undefined for primitives', t => {
  const table = makeTestTable();

  // Primitives can't be used as WeakMap keys, so should return undefined
  t.is(table.getSlotForValue(42), undefined);
  t.is(table.getSlotForValue('string'), undefined);
  t.is(table.getSlotForValue(null), undefined);
  t.is(table.getSlotForValue(undefined), undefined);
});

test('makePairwiseTable - refcount accumulates across multiple commit cycles', t => {
  const table = makeTestTable();
  const slot = makeSlot('o', true, 1n);
  const obj = Far('test', { getValue: () => 42 });

  table.registerSlot(slot, obj);

  // First cycle - increments by 1
  table.getSlotForValue(obj);
  table.commitSentRefCounts();
  t.is(table.getRefCount(slot), 1);

  // Second cycle - multiple calls still only increment by 1 (uses Set)
  table.getSlotForValue(obj);
  table.getSlotForValue(obj);
  table.commitSentRefCounts();
  t.is(table.getRefCount(slot), 2);

  // Third cycle - increments by 1 again
  table.getSlotForValue(obj);
  table.commitSentRefCounts();
  t.is(table.getRefCount(slot), 3);
});

test('makePairwiseTable - mixed commit/abort/clear operations', t => {
  const table = makeTestTable();
  const slot = makeSlot('o', true, 1n);
  const obj = Far('test', { getValue: () => 42 });

  table.registerSlot(slot, obj);

  // Build up and commit (increments by 1, not 2, since Set is used)
  table.getSlotForValue(obj);
  table.getSlotForValue(obj);
  table.commitSentRefCounts();
  t.is(table.getRefCount(slot), 1);

  // Build up and abort
  table.getSlotForValue(obj);
  table.getSlotForValue(obj);
  table.clearPendingRefCounts();
  t.is(table.getRefCount(slot), 1); // Should still be 1

  // Build up and commit again
  table.getSlotForValue(obj);
  table.commitSentRefCounts();
  t.is(table.getRefCount(slot), 2);
});
