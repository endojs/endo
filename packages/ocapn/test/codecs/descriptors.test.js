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
  makePeer,
  makePubKey,
  makeSig,
  makeSignedHandoffGiveSyrup,
  makeSignedHandoffReceiveSyrup,
  record,
  sel,
  strToArrayBuffer,
} from './_syrup_util.js';
import { makeSyrupReader } from '../../src/syrup/decode.js';
import { encodeSwissnum } from '../../src/client/util.js';

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
      makePeer('tcp', '1234', { host: '127.0.0.1', port: '54822' }),
      btsStr('123'),
    ),
    makeValueAfter: testKit =>
      testKit.lookupSturdyRef(
        {
          type: 'ocapn-peer',
          transport: 'tcp',
          designator: '1234',
          hints: { host: '127.0.0.1', port: '54822' },
        },
        encodeSwissnum('123'),
      ),
    skipWrite: true,
  },
  {
    name: 'handoff-give',
    syrup: makeSignedHandoffGiveSyrup(
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
            type: 'ocapn-peer',
            transport: 'tcp',
            designator: '1234',
            hints: { host: '127.0.0.1', port: '54822' },
          },
          // @ts-expect-error - Branded type: SessionId is ArrayBufferLike at runtime
          exporterSessionId: strToArrayBuffer('exporter-session-id'),
          gifterSideId: strToArrayBuffer('gifter-side-id'),
          giftId: strToArrayBuffer('gift-id'),
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
        makePeer('tcp', '1234', { host: '127.0.0.1', port: '54822' }),
        strToArrayBuffer('exporter-session-id'),
        strToArrayBuffer('gifter-side-id'),
        strToArrayBuffer('gift-id'),
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
            type: 'ocapn-peer',
            transport: 'tcp',
            designator: '1234',
            hints: { host: '127.0.0.1', port: '54822' },
          },
          // @ts-expect-error - Branded type: SessionId is ArrayBufferLike at runtime
          exporterSessionId: strToArrayBuffer('exporter-session-id'),
          gifterSideId: strToArrayBuffer('gifter-side-id'),
          giftId: strToArrayBuffer('gift-id'),
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
    syrup: makeSignedHandoffReceiveSyrup(),
    skipWrite: true,
    makeValue: () => ({
      type: 'desc:sig-envelope',
      object: {
        type: 'desc:handoff-receive',
        receivingSession: strToArrayBuffer('123'),
        receivingSide: strToArrayBuffer('456'),
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
              type: 'ocapn-peer',
              transport: 'tcp',
              designator: '1234',
              hints: { host: '127.0.0.1', port: '54822' },
            },
            exporterSessionId: strToArrayBuffer('exporter-session-id'),
            gifterSideId: strToArrayBuffer('gifter-side-id'),
            giftId: strToArrayBuffer('gift-id'),
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
