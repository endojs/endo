// @ts-check

/** @typedef {import('./_codecs_util.js').CodecTestEntry} CodecTestEntry */

import test from '@endo/ses-ava/prepare-endo.js';

import { throws } from '../_util.js';
import { makeCodecTestKit, testBidirectionally } from './_codecs_util.js';
import { sel } from './_syrup_util.js';
import { makeSyrupReader } from '../../src/syrup/decode.js';

const textEncoder = new TextEncoder();

/**
 * @typedef {Omit<CodecTestEntry, 'codec'> & { makeValue?: (testKit: ReturnType<typeof makeCodecTestKit>) => any }} DescriptorTestEntry
 *
 * @type {DescriptorTestEntry[]}
 */
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
  // TODO: Support handoffs
  // {
  //   syrup: record(
  //     'desc:handoff-give',
  //     makePubKey(examplePubKeyQBytes),
  //     makeNode('tcp', '127.0.0.1', false),
  //     btsStr('exporter-session-id'),
  //     btsStr('gifter-side-id'),
  //     btsStr('gift-id'),
  //   ),
  //   value: {
  //     type: 'desc:handoff-give',
  //     receiverKey: {
  //       type: 'public-key',
  //       scheme: 'ecc',
  //       curve: 'Ed25519',
  //       flags: 'eddsa',
  //       q: examplePubKeyQBytes,
  //     },
  //     exporterLocation: {
  //       type: 'ocapn-node',
  //       transport: 'tcp',
  //       address: '127.0.0.1',
  //       hints: false,
  //     },
  //     exporterSessionId: strToUint8Array('exporter-session-id'),
  //     gifterSideId: strToUint8Array('gifter-side-id'),
  //     giftId: strToUint8Array('gift-id'),
  //   },
  // },
  // {
  //   syrup: record(
  //     'desc:sig-envelope',
  //     makeDescGive(
  //       makePubKey(examplePubKeyQBytes),
  //       makeNode('tcp', '127.0.0.1', false),
  //       strToUint8Array('exporter-session-id'),
  //       strToUint8Array('gifter-side-id'),
  //       strToUint8Array('gift-id'),
  //     ),
  //     makeSig(exampleSigParamBytes, exampleSigParamBytes),
  //   ),
  //   value: {
  //     type: 'desc:sig-envelope',
  //     object: {
  //       type: 'desc:handoff-give',
  //       receiverKey: {
  //         type: 'public-key',
  //         scheme: 'ecc',
  //         curve: 'Ed25519',
  //         flags: 'eddsa',
  //         q: examplePubKeyQBytes,
  //       },
  //       exporterLocation: {
  //         type: 'ocapn-node',
  //         transport: 'tcp',
  //         address: '127.0.0.1',
  //         hints: false,
  //       },
  //       exporterSessionId: strToUint8Array('exporter-session-id'),
  //       gifterSideId: strToUint8Array('gifter-side-id'),
  //       giftId: strToUint8Array('gift-id'),
  //     },
  //     signature: {
  //       type: 'sig-val',
  //       scheme: 'eddsa',
  //       r: exampleSigParamBytes,
  //       s: exampleSigParamBytes,
  //     },
  //   },
  // },
  // // handoff receive
  // {
  //   syrup: record(
  //     'desc:handoff-receive',
  //     btsStr('123'),
  //     btsStr('456'),
  //     int(1),
  //     makeSigEnvelope(
  //       makeDescGive(
  //         makePubKey(examplePubKeyQBytes),
  //         makeNode('tcp', '127.0.0.1', false),
  //         strToUint8Array('exporter-session-id'),
  //         strToUint8Array('gifter-side-id'),
  //         strToUint8Array('gift-id'),
  //       ),
  //       makeSig(exampleSigParamBytes, exampleSigParamBytes),
  //     ),
  //   ),
  //   value: {
  //     type: 'desc:handoff-receive',
  //     receivingSession: strToUint8Array('123'),
  //     receivingSide: strToUint8Array('456'),
  //     handoffCount: 1n,
  //     signedGive: {
  //       type: 'desc:sig-envelope',
  //       object: {
  //         type: 'desc:handoff-give',
  //         receiverKey: {
  //           type: 'public-key',
  //           scheme: 'ecc',
  //           curve: 'Ed25519',
  //           flags: 'eddsa',
  //           q: examplePubKeyQBytes,
  //         },
  //         exporterLocation: {
  //           type: 'ocapn-node',
  //           transport: 'tcp',
  //           address: '127.0.0.1',
  //           hints: false,
  //         },
  //         exporterSessionId: strToUint8Array('exporter-session-id'),
  //         gifterSideId: strToUint8Array('gifter-side-id'),
  //         giftId: strToUint8Array('gift-id'),
  //       },
  //       signature: {
  //         type: 'sig-val',
  //         scheme: 'eddsa',
  //         r: exampleSigParamBytes,
  //         s: exampleSigParamBytes,
  //       },
  //     },
  //   },
  // },
  // // From the python test suite
  // {
  //   syrup: hexToUint8Array(
  //     '3c313727646573633a68616e646f66662d676976655b3130277075626c69632d6b65795b33276563635b352763757276653727456432353531395d5b3527666c616773352765646473615d5b31277133323aee6f0ea527145fa7716eae012c3897a7e7189f5ec15ecbbc28b242dac194d1d45d5d5d3c3130276f6361706e2d6e6f64653136277463702d74657374696e672d6f6e6c793135223132372e302e302e313a3631303035663e33323a2efa09d73d6ebfc89049111929454185d0a84951d7205f417e5170ca0ce856c633323af850bbc2ab01359fab54c0e310984528d5692b7579339a1ce4a161bfec3a0b82373a6d792d676966743e',
  //   ),
  //   value: {
  //     type: 'desc:handoff-give',
  //     receiverKey: {
  //       type: 'public-key',
  //       scheme: 'ecc',
  //       curve: 'Ed25519',
  //       flags: 'eddsa',
  //       q: hexToUint8Array(
  //         'ee6f0ea527145fa7716eae012c3897a7e7189f5ec15ecbbc28b242dac194d1d4',
  //       ),
  //     },
  //     exporterLocation: {
  //       type: 'ocapn-node',
  //       transport: 'tcp-testing-only',
  //       address: '127.0.0.1:61005',
  //       hints: false,
  //     },
  //     exporterSessionId: hexToUint8Array(
  //       '2efa09d73d6ebfc89049111929454185d0a84951d7205f417e5170ca0ce856c6',
  //     ),
  //     gifterSideId: hexToUint8Array(
  //       'f850bbc2ab01359fab54c0e310984528d5692b7579339a1ce4a161bfec3a0b82',
  //     ),
  //     giftId: strToUint8Array('my-gift'),
  //   },
  // },
];

test('affirmative descriptor cases', t => {
  for (const entry of table) {
    const testKit = makeCodecTestKit();
    const { value, makeValue } = entry;
    const expectedValue = value || (makeValue && makeValue(testKit));
    const codec = testKit.ReferenceCodec;
    testBidirectionally(t, { codec, ...entry, value: expectedValue });
  }
});

test('descriptor fails with negative integer', t => {
  const testKit = makeCodecTestKit();
  const codec = testKit.DescImportObject;
  const syrup = `<${sel('desc:import-object')}1-}>`;
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, {
    name: 'import-object with negative integer',
  });
  throws(t, () => codec.read(syrupReader), {
    message:
      'DescImportObject: read failed at index 0 of import-object with negative integer',
    cause: {
      message: 'PositiveIntegerCodec: value must be positive',
    },
  });
});
