import test from '@endo/ses-ava/prepare-endo.js';

import { Far, Remotable } from '@endo/marshal';
import { isPromise } from '@endo/promise-kit';
import { makeLoopback, E } from '../src/loopback.js';

const getRandomId = () => Math.random().toString(36).slice(2);

// a custom import/export table maker with random slot ids
const makeMakeCaptpImportExportTables = ({
  slotToExported = new Map(),
  slotToImported = new Map(),
}) => {
  const makeCaptpImportExportTables = ({ makeRemoteKit }) => {
    const makeSlotForValue = val => {
      const type = isPromise(val) ? 'p' : 'o';
      const slot = `${type}+${getRandomId()}`;
      return slot;
    };

    const makeValueForSlot = (slot, iface) => {
      const type = slot[0];
      if (type === 'p') {
        throw new Error(`not implemented`);
      }
      const { settler } = makeRemoteKit(slot);
      const val = Remotable(iface, undefined, settler.resolveWithPresence());
      return { val, settler };
    };

    return {
      makeSlotForValue,
      makeValueForSlot,
      hasImport: slot => slotToImported.has(slot),
      getImport: slot => slotToImported.get(slot),
      markAsImported: (slot, val) => slotToImported.set(slot, val),
      hasExport: slot => slotToExported.has(slot),
      getExport: slot => slotToExported.get(slot),
      markAsExported: (slot, val) => slotToExported.set(slot, val),
      deleteExport: slot => slotToExported.delete(slot),
      didDisconnect: () => {
        slotToImported.clear();
        slotToExported.clear();
      },
    };
  };
  return makeCaptpImportExportTables;
};

test('prevent crosstalk', async t => {
  const nearTables = {
    slotToExported: new Map(),
    slotToImported: new Map(),
  };
  const farTables = {
    slotToExported: new Map(),
    slotToImported: new Map(),
  };
  const nearCaptpOpts = {
    makeCaptpImportExportTables: makeMakeCaptpImportExportTables(nearTables),
  };
  const farCaptpOpts = {
    makeCaptpImportExportTables: makeMakeCaptpImportExportTables(farTables),
  };

  const { makeFar } = makeLoopback('alice', nearCaptpOpts, farCaptpOpts);
  const rightRef = await makeFar(
    Far('rightRef', {
      makeData() {
        return { key: 'value' };
      },
      makeRemotable() {
        return Far('remotable', {
          ping() {
            return 'pong';
          },
        });
      },
    }),
  );

  const expectTableSizes = ({
    near: [nearImported, nearExported],
    far: [farImported, farExported],
  }) => {
    t.is(nearTables.slotToImported.size, nearImported);
    t.is(nearTables.slotToExported.size, nearExported);
    t.is(farTables.slotToImported.size, farImported);
    t.is(farTables.slotToExported.size, farExported);
  };

  expectTableSizes({
    near: [4, 1],
    far: [2, 2],
  });
  const remotable = await E(rightRef).makeRemotable();
  expectTableSizes({
    near: [6, 1],
    far: [2, 3],
  });
  await E(remotable).ping();
  expectTableSizes({
    near: [7, 1],
    far: [2, 3],
  });
  await E(rightRef).makeData();
  expectTableSizes({
    near: [8, 1],
    far: [2, 3],
  });
});
