// @ts-check

import harden from '@endo/harden';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import {
  testWithErrorUnwrapping,
  makeTestClientPair,
  getOcapnDebug,
  waitUntilTrue,
} from './_util.js';
import { encodeSwissnum } from '../src/client/util.js';
import { makeSlot, parseSlot } from '../src/captp/pairwise.js';

testWithErrorUnwrapping(
  'op:flush swaps the export and acknowledges',
  async t => {
    // B exports a Promise (via PromiseProvider.get()). A then sends
    // op:flush targeting the export-position. B should swap the value
    // at that position for a fresh local promise and reply with
    // op:flush-done. A's flushExport() promise resolves on receipt.
    const promiseKit = makePromiseKit();
    const testObjectTable = new Map();
    testObjectTable.set(
      'PromiseProvider',
      Far('PromiseProvider', {
        // Wrapping the promise in an array forces it to be serialized as a
        // desc:import-promise immediately rather than awaited; otherwise an
        // unresolved promise return value blocks the fulfill message until
        // it settles.
        get: () => harden([promiseKit.promise]),
      }),
    );

    const { establishSession, shutdownBoth } = await makeTestClientPair({
      makeDefaultSwissnumTable: () => testObjectTable,
      clientAOptions: { enableImportCollection: false },
      clientBOptions: { enableImportCollection: false },
    });

    try {
      const { sessionA, sessionB } = await establishSession();
      const debugA = getOcapnDebug(sessionA.ocapn);
      const debugB = getOcapnDebug(sessionB.ocapn);

      const bootstrapB = sessionA.ocapn.getRemoteBootstrap();
      const provider = await E(bootstrapB).fetch(
        encodeSwissnum('PromiseProvider'),
      );
      // Trigger the Promise to be exported by B.
      const answerPromise = E(provider).get();
      // Drop the floating promise; the call's mere act of being sent
      // ensures B exports its promise.
      answerPromise.catch(() => {});

      // Wait until B has registered an export slot for promiseKit.promise.
      await waitUntilTrue(
        () =>
          debugB.ocapnTable.getSlotForValue(promiseKit.promise) !== undefined,
      );
      const bExportSlot = debugB.ocapnTable.getSlotForValue(promiseKit.promise);
      if (!bExportSlot) {
        t.fail('B did not export its promise');
        return;
      }
      const { type, isLocal, position } = parseSlot(bExportSlot);
      t.is(type, 'p', 'B exported the value as a promise slot');
      t.true(isLocal, 'slot is local on B');

      // Now wait until A has imported the promise at the matching slot.
      const aImportSlot = makeSlot('p', false, position);
      await waitUntilTrue(
        () => debugA.ocapnTable.getValueForSlot(aImportSlot) !== undefined,
      );
      const aImportValue = debugA.ocapnTable.getValueForSlot(aImportSlot);
      if (!aImportValue) {
        t.fail('A does not have an import for the promise position');
        return;
      }

      // Verify that B holds promiseKit.promise at the export position.
      const beforeValue = debugB.ocapnTable.getValueForSlot(bExportSlot);
      t.is(
        beforeValue,
        promiseKit.promise,
        'before flush, B exports its original promise at the position',
      );

      // Issue the flush from A.
      const flushDone = debugA.flushExport(aImportValue);
      await flushDone;

      // After op:flush-done has been received on A, B's export at the
      // same position must be a *different* (still pending) promise.
      const afterValue = debugB.ocapnTable.getValueForSlot(bExportSlot);
      t.not(
        afterValue,
        promiseKit.promise,
        'after flush, B has swapped the export for a fresh promise',
      );
      t.true(
        afterValue instanceof Promise,
        'after flush, the swapped export is still a promise',
      );
    } finally {
      shutdownBoth();
    }
  },
);

testWithErrorUnwrapping(
  'flushExport: a second flush at the same position errors',
  async t => {
    const promiseKit = makePromiseKit();
    const testObjectTable = new Map();
    testObjectTable.set(
      'PromiseProvider',
      Far('PromiseProvider', {
        get: () => harden([promiseKit.promise]),
      }),
    );

    const { establishSession, shutdownBoth } = await makeTestClientPair({
      makeDefaultSwissnumTable: () => testObjectTable,
      clientAOptions: { enableImportCollection: false },
      clientBOptions: { enableImportCollection: false },
    });

    try {
      const { sessionA, sessionB } = await establishSession();
      const debugA = getOcapnDebug(sessionA.ocapn);
      const debugB = getOcapnDebug(sessionB.ocapn);

      const provider = await E(sessionA.ocapn.getRemoteBootstrap()).fetch(
        encodeSwissnum('PromiseProvider'),
      );
      E(provider)
        .get()
        .catch(() => {});

      await waitUntilTrue(
        () =>
          debugB.ocapnTable.getSlotForValue(promiseKit.promise) !== undefined,
      );
      const bSlot = debugB.ocapnTable.getSlotForValue(promiseKit.promise);
      if (!bSlot) {
        t.fail('B did not export the promise');
        return;
      }
      const { position } = parseSlot(bSlot);
      const aSlot = makeSlot('p', false, position);
      await waitUntilTrue(
        () => debugA.ocapnTable.getValueForSlot(aSlot) !== undefined,
      );
      const aValue = debugA.ocapnTable.getValueForSlot(aSlot);
      if (!aValue) {
        t.fail('A does not have an import for the promise position');
        return;
      }

      // Start a flush but do not await it.
      const firstFlush = debugA.flushExport(aValue);
      // Calling again before the first completes must throw.
      t.throws(() => debugA.flushExport(aValue), {
        message: /already pending/,
      });
      await firstFlush;
    } finally {
      shutdownBoth();
    }
  },
);

testWithErrorUnwrapping(
  'flushExport rejects for non-promise references',
  async t => {
    const testObjectTable = new Map();
    testObjectTable.set('Greeter', Far('Greeter', { hi: () => 'hello' }));
    const { establishSession, shutdownBoth } = await makeTestClientPair({
      makeDefaultSwissnumTable: () => testObjectTable,
    });
    try {
      const { sessionA } = await establishSession();
      const debugA = getOcapnDebug(sessionA.ocapn);
      const greeter = await E(sessionA.ocapn.getRemoteBootstrap()).fetch(
        encodeSwissnum('Greeter'),
      );
      // Greeter is an imported *object*, not a promise. flushExport
      // should refuse it.
      t.throws(() => debugA.flushExport(greeter), {
        message: /must be a promise/,
      });
    } finally {
      shutdownBoth();
    }
  },
);

testWithErrorUnwrapping('flushExport rejects for unknown values', async t => {
  const { establishSession, shutdownBoth } = await makeTestClientPair({});
  try {
    const { sessionA } = await establishSession();
    const debugA = getOcapnDebug(sessionA.ocapn);
    t.throws(() => debugA.flushExport(Far('NotTracked', {})), {
      message: /not tracked/,
    });
  } finally {
    shutdownBoth();
  }
});
