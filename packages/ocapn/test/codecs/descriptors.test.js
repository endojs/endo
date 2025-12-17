// @ts-check

/**
 * @import { CodecTestEntry } from './_codecs_util.js'
 */

import test from '@endo/ses-ava/test.js';

import { throws } from '../_util.js';
import {
  makeCodecTestKit,
  examplePubKeyQBytes,
  exampleSigParamBytes,
  runTableTests,
} from './_codecs_util.js';
import { intSyrup, recordSyrup } from './_syrup_util.js';
import { makeSyrupReader } from '../../src/syrup/decode.js';
import {
  immutableArrayBufferToUint8Array,
  encodeStringToImmutableArrayBuffer,
} from '../../src/buffer-utils.js';

/** @type {CodecTestEntry[]} */
const table = [
  {
    name: 'export',
    makeValue: testKit => testKit.tableKit.convertPositionToRemoteVal(123n),
    skipRead: true,
  },
  {
    name: 'export-promise',
    makeValue: testKit => testKit.tableKit.provideRemotePromise(456n),
    skipRead: true,
  },
  {
    name: 'import-object',
    makeValue: testKit => testKit.makeExportAt(123n),
    skipRead: true,
  },
  {
    name: 'answer',
    makeValue: testKit => testKit.makeAnswerAt(123n),
    skipRead: true,
  },
  {
    name: 'handoff receive',
    skipRead: true,
    makeValue: () => ({
      type: 'desc:sig-envelope',
      object: {
        type: 'desc:handoff-receive',
        receivingSession: encodeStringToImmutableArrayBuffer('123'),
        receivingSide: encodeStringToImmutableArrayBuffer('456'),
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
            exporterSessionId: encodeStringToImmutableArrayBuffer(
              'exporter-session-id',
            ),
            gifterSideId: encodeStringToImmutableArrayBuffer('gifter-side-id'),
            giftId: encodeStringToImmutableArrayBuffer('gift-id'),
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

runTableTests(test, 'ReferenceCodec', table, testKit => testKit.ReferenceCodec);

test('descriptor fails with negative integer', t => {
  const testKit = makeCodecTestKit();
  const codec = testKit.DescImportObjectCodec;
  const syrup = recordSyrup('desc:import-object', intSyrup(-1));
  const syrupBytes = immutableArrayBufferToUint8Array(syrup);
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
