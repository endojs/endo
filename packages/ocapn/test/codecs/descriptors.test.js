// @ts-check

/**
 * @import { CodecTestEntry } from './_codecs_util.js'
 */

import test from '@endo/ses-ava/test.js';

import { throws } from '../_util.js';
import { makeCodecTestKit, testBidirectionally } from './_codecs_util.js';
import {
  btsStr,
  examplePubKeyQBytes,
  exampleSigParamBytes,
  makeDescGive,
  makeNode,
  makePubKey,
  makeSig,
  makeSignedHandoffGive,
  makeSignedHandoffReceive,
  record,
  sel,
  strToUint8Array,
} from './_syrup_util.js';
import { makeSyrupReader } from '../../src/syrup/decode.js';

const textEncoder = new TextEncoder();

/** @type {CodecTestEntry[]} */
const table = [
  {
    syrup: `<18'desc:import-object123+>`,
    returnSyrup: `<11'desc:export123+>`,
    makeValue: testKit => testKit.tableKit.convertPositionToRemoteVal(123n),
  },
  {
    syrup: `<19'desc:import-promise456+>`,
    returnSyrup: `<11'desc:export456+>`,
    makeValue: testKit => testKit.tableKit.provideRemotePromise(456n),
  },
  {
    syrup: `<11'desc:export123+>`,
    returnSyrup: `<18'desc:import-object123+>`,
    makeValue: testKit => testKit.makeExportAt(123n),
  },
  {
    syrup: `<11'desc:answer123+>`,
    makeValue: testKit => testKit.makeAnswerAt(123n),
    skipWrite: true,
  },
  {
    name: 'sturdyref',
    syrup: record(
      'ocapn-sturdyref',
      makeNode('tcp', '127.0.0.1', false),
      btsStr('123'),
    ),
    makeValueAfter: testKit =>
      testKit.lookupSturdyRef(
        {
          type: 'ocapn-node',
          transport: 'tcp',
          address: '127.0.0.1',
          hints: false,
        },
        strToUint8Array('123'),
      ),
    skipWrite: true,
  },
  {
    name: 'handoff-give',
    syrup: makeSignedHandoffGive(
      makeSig(exampleSigParamBytes, exampleSigParamBytes),
    ),
    makeValueAfter: testKit =>
      testKit.lookupHandoff({
        type: 'desc:sig-envelope',
        object: {
          type: 'desc:handoff-give',
          receiverKey: {
            type: 'public-key',
            scheme: 'ecc',
            curve: 'Ed25519',
            flags: 'eddsa',
            q: examplePubKeyQBytes,
          },
          exporterLocation: {
            type: 'ocapn-node',
            transport: 'tcp',
            address: '127.0.0.1',
            hints: false,
          },
          exporterSessionId: strToUint8Array('exporter-session-id'),
          gifterSideId: strToUint8Array('gifter-side-id'),
          giftId: strToUint8Array('gift-id'),
        },
        signature: {
          type: 'sig-val',
          scheme: 'eddsa',
          r: exampleSigParamBytes,
          s: exampleSigParamBytes,
        },
      }),
    skipWrite: true,
  },
  {
    name: 'handoff-give 2',
    syrup: record(
      'desc:sig-envelope',
      makeDescGive(
        makePubKey(examplePubKeyQBytes),
        makeNode('tcp', '127.0.0.1', false),
        strToUint8Array('exporter-session-id'),
        strToUint8Array('gifter-side-id'),
        strToUint8Array('gift-id'),
      ),
      makeSig(exampleSigParamBytes, exampleSigParamBytes),
    ),
    makeValueAfter: testKit =>
      testKit.lookupHandoff({
        type: 'desc:sig-envelope',
        object: {
          type: 'desc:handoff-give',
          receiverKey: {
            type: 'public-key',
            scheme: 'ecc',
            curve: 'Ed25519',
            flags: 'eddsa',
            q: examplePubKeyQBytes,
          },
          exporterLocation: {
            type: 'ocapn-node',
            transport: 'tcp',
            address: '127.0.0.1',
            hints: false,
          },
          exporterSessionId: strToUint8Array('exporter-session-id'),
          gifterSideId: strToUint8Array('gifter-side-id'),
          giftId: strToUint8Array('gift-id'),
        },
        signature: {
          type: 'sig-val',
          scheme: 'eddsa',
          r: exampleSigParamBytes,
          s: exampleSigParamBytes,
        },
      }),
    skipWrite: true,
  },
  {
    name: 'handoff receive',
    syrup: makeSignedHandoffReceive(),
    skipWrite: true,
    makeValue: () => ({
      type: 'desc:sig-envelope',
      object: {
        type: 'desc:handoff-receive',
        receivingSession: strToUint8Array('123'),
        receivingSide: strToUint8Array('456'),
        handoffCount: 1n,
        signedGive: {
          type: 'desc:sig-envelope',
          object: {
            type: 'desc:handoff-give',
            receiverKey: {
              type: 'public-key',
              scheme: 'ecc',
              curve: 'Ed25519',
              flags: 'eddsa',
              q: examplePubKeyQBytes,
            },
            exporterLocation: {
              type: 'ocapn-node',
              transport: 'tcp',
              address: '127.0.0.1',
              hints: false,
            },
            exporterSessionId: strToUint8Array('exporter-session-id'),
            gifterSideId: strToUint8Array('gifter-side-id'),
            giftId: strToUint8Array('gift-id'),
          },
          signature: {
            type: 'sig-val',
            scheme: 'eddsa',
            r: exampleSigParamBytes,
            s: exampleSigParamBytes,
          },
        },
      },
      signature: {
        type: 'sig-val',
        scheme: 'eddsa',
        r: exampleSigParamBytes,
        s: exampleSigParamBytes,
      },
    }),
  },
];

test('affirmative descriptor cases', t => {
  for (const [index, entry] of table.entries()) {
    const name = `test-${index}`;
    testBidirectionally(t, {
      name,
      getCodec: testKit => testKit.ReferenceCodec,
      ...entry,
    });
  }
});

test('descriptor fails with negative integer', t => {
  const testKit = makeCodecTestKit();
  const codec = testKit.DescImportObjectCodec;
  const syrup = `<${sel('desc:import-object')}1-}>`;
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, {
    name: 'import-object with negative integer',
  });
  throws(t, () => codec.read(syrupReader), {
    message:
      'DescImportObject: read failed at index 0 of import-object with negative integer',
    cause: {
      message:
        'NonNegativeInteger: read failed at index 22 of import-object with negative integer',
      cause: {
        message: 'value must be non-negative',
      },
    },
  });
});
