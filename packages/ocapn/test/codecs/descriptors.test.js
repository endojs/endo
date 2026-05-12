// @ts-check

/**
 * @import { CodecTestEntry } from './_codecs_util.js'
 */

import test from '@endo/ses-ava/test.js';

import { bytesFromImmutable } from '@endo/bytes/from-immutable.js';
import { bytesToImmutable } from '@endo/bytes/to-immutable.js';
import { bytesFromText } from '@endo/bytes/from-string.js';
import { throws } from '../_util.js';
import {
  makeCodecTestKit,
  examplePubKeyQBytes,
  exampleSigParamBytes,
  runTableTestsAllCodecs,
  SyrupCodec,
} from './_codecs_util.js';
import { intSyrup, recordSyrup } from './_syrup_util.js';

/** @type {CodecTestEntry[]} */
const table = [
  {
    name: 'export',
    makeValue: testKit => testKit.referenceKit.provideRemoteObjectValue(123n),
    makeExpectedValue: testKit => testKit.makeLocalObject(123n),
  },
  {
    name: 'export (promise)',
    makeValue: testKit => testKit.referenceKit.provideRemotePromiseValue(456n),
    makeExpectedValue: testKit => testKit.makeLocalPromise(456n),
  },
  {
    name: 'import-object',
    makeValue: testKit => testKit.makeLocalObject(123n),
    makeExpectedValue: testKit =>
      testKit.referenceKit.provideRemoteObjectValue(123n),
  },
  {
    name: 'import-promise',
    makeValue: testKit => testKit.makeLocalPromise(123n),
    makeExpectedValue: testKit =>
      testKit.referenceKit.provideRemotePromiseValue(123n),
  },
  {
    name: 'answer',
    makeValue: testKit => testKit.makeRemoteAnswer(123n),
    makeExpectedValue: testKit => testKit.makeLocalAnswer(123n),
  },
  {
    name: 'handoff receive',
    getCodec: testKit => testKit.DescSigEnvelopeReadCodec,
    skipRead: true,
    makeValue: () => ({
      type: 'desc:sig-envelope',
      object: {
        type: 'desc:handoff-receive',
        receivingSession: bytesToImmutable(bytesFromText('123')),
        receivingSide: bytesToImmutable(bytesFromText('456')),
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
            exporterSessionId: bytesToImmutable(
              bytesFromText('exporter-session-id'),
            ),
            gifterSideId: bytesToImmutable(bytesFromText('gifter-side-id')),
            giftId: bytesToImmutable(bytesFromText('gift-id')),
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

runTableTestsAllCodecs(
  test,
  'ReferenceCodec',
  table,
  testKit => testKit.ReferenceCodec,
);

// This test uses Syrup-specific encoding to test error handling
test('descriptor fails with negative integer [syrup]', t => {
  const testKit = makeCodecTestKit();
  const codec = testKit.DescImportObjectCodec;
  const syrup = recordSyrup('desc:import-object', intSyrup(-1));
  const syrupBytes = bytesFromImmutable(syrup);
  const syrupReader = SyrupCodec.makeReader(syrupBytes, {
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
