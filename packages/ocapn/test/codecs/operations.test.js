// @ts-check

/**
 * @import { CodecTestEntry } from './_codecs_util.js'
 */

import test from '@endo/ses-ava/test.js';
import {
  uint8ArrayToImmutableArrayBuffer,
  encodeStringToImmutableArrayBuffer,
  hexToArrayBuffer,
} from '../../src/buffer-utils.js';
import { makeSelector } from '../../src/selector.js';
import {
  exampleSigParamBytes,
  examplePubKeyQBytes,
  runTableTests,
  makeCodecTestKit,
} from './_codecs_util.js';
import { makeSyrupWriter } from '../../src/syrup/encode.js';

/** @type {CodecTestEntry[]} */
export const table = [
  {
    // <op:start-session captp-version             ; String value
    //                   session-pubkey            ; CapTP public key value
    //                   acceptable-location       ; OCapN Reference type
    //                   acceptable-location-sig>  ; CapTP signature
    name: 'op:start-session',
    value: {
      type: 'op:start-session',
      captpVersion: 'captp-v1',
      sessionPublicKey: {
        type: 'public-key',
        scheme: 'ecc',
        curve: 'Ed25519',
        flags: 'eddsa',
        q: examplePubKeyQBytes,
      },
      location: {
        type: 'ocapn-peer',
        designator: '1234',
        transport: 'tcp',
        hints: { host: '127.0.0.1', port: '54822' },
      },
      locationSignature: {
        type: 'sig-val',
        scheme: 'eddsa',
        r: exampleSigParamBytes,
        s: exampleSigParamBytes,
      },
    },
  },
  {
    // <op:deliver-only <desc:export 1> ['fulfill <desc:import-object 2>]>
    name: 'op:deliver-only fulfill',
    makeValue: testKit => ({
      type: 'op:deliver-only',
      to: testKit.referenceKit.provideRemoteObjectValue(1n),
      args: [makeSelector('fulfill'), testKit.makeLocalObject(2n)],
    }),
    makeExpectedValue: testKit => ({
      type: 'op:deliver-only',
      to: testKit.makeLocalObject(1n),
      args: [
        makeSelector('fulfill'),
        testKit.referenceKit.provideRemoteObjectValue(2n),
      ],
    }),
  },
  {
    // <op:deliver-only <desc:export 0>               ; Remote bootstrap object
    //                  ['deposit-gift                ; Symbol "deposit-gift"
    //                   42                           ; gift-id, a positive integer
    //                   <desc:import-object ...>]>   ; remote object being shared
    name: 'op:deliver-only deposit-gift',
    makeValue: testKit => ({
      type: 'op:deliver-only',
      to: testKit.referenceKit.provideRemoteObjectValue(0n),
      args: [makeSelector('deposit-gift'), 42n, testKit.makeLocalObject(1n)],
    }),
    makeExpectedValue: testKit => ({
      type: 'op:deliver-only',
      to: testKit.makeLocalObject(0n),
      args: [
        makeSelector('deposit-gift'),
        42n,
        testKit.referenceKit.provideRemoteObjectValue(1n),
      ],
    }),
  },
  {
    // <op:deliver <desc:export 5> ['make-car-factory] 3 <desc:import-object 15>>
    name: 'op:deliver make-car-factory',
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.referenceKit.provideRemoteObjectValue(5n),
      args: [makeSelector('make-car-factory')],
      answerPosition: 3n,
      resolveMeDesc: testKit.makeLocalObject(15n),
    }),
    makeExpectedValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeLocalObject(5n),
      args: [makeSelector('make-car-factory')],
      answerPosition: 3n,
      resolveMeDesc: testKit.referenceKit.provideRemoteObjectValue(15n),
    }),
  },
  {
    // <op:deliver <desc:export 1> ['beep] false <desc:import-object 2>>
    name: 'op:deliver beep',
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.referenceKit.provideRemoteObjectValue(1n),
      args: [makeSelector('beep')],
      answerPosition: false,
      resolveMeDesc: testKit.makeLocalObject(2n),
    }),
    makeExpectedValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeLocalObject(1n),
      args: [makeSelector('beep')],
      answerPosition: false,
      resolveMeDesc: testKit.referenceKit.provideRemoteResolverValue(2n),
    }),
  },
  {
    // <op:deliver <desc:export 0>          ; Remote bootstrap object
    //             ['fetch                  ; Argument 1: Symbol "fetch"
    //              swiss-number]           ; Argument 2: Binary Data
    //             3                        ; Answer position: positive integer
    //             <desc:import-object 5>>  ; object exported by us at position 5 should provide the answer
    name: 'op:deliver fetch',
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.referenceKit.provideRemoteObjectValue(0n),
      args: [
        makeSelector('fetch'),
        encodeStringToImmutableArrayBuffer('swiss-number'),
      ],
      answerPosition: 3n,
      resolveMeDesc: testKit.makeLocalObject(5n),
    }),
    makeExpectedValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeLocalObject(0n),
      args: [
        makeSelector('fetch'),
        encodeStringToImmutableArrayBuffer('swiss-number'),
      ],
      answerPosition: 3n,
      resolveMeDesc: testKit.referenceKit.provideRemoteObjectValue(5n),
    }),
  },
  {
    // <op:abort reason>  ; reason: String
    name: 'op:abort',
    value: {
      type: 'op:abort',
      reason: 'explode',
    },
  },
  {
    // <op:listen to-desc           ; desc:export | desc:answer
    //            listen-desc       ; desc:import-object
    //            wants-partial?    ; boolean
    name: 'op:listen',
    makeValue: testKit => ({
      type: 'op:listen',
      to: testKit.referenceKit.provideRemotePromiseValue(1n),
      resolveMeDesc: testKit.makeLocalObject(2n),
      wantsPartial: false,
    }),
    makeExpectedValue: testKit => ({
      type: 'op:listen',
      to: testKit.makeLocalPromise(1n),
      resolveMeDesc: testKit.referenceKit.provideRemoteObjectValue(2n),
      wantsPartial: false,
    }),
  },
  {
    // <op:gc-export export-pos   ; positive integer
    //               wire-delta>  ; positive integer
    name: 'op:gc-export',
    value: {
      type: 'op:gc-export',
      exportPosition: 1n,
      wireDelta: 2n,
    },
  },
  {
    // <op:gc-answer answer-pos>  ; answer-pos: positive integer
    name: 'op:gc-answer',
    value: {
      type: 'op:gc-answer',
      answerPosition: 1n,
    },
  },
  // Below are messages observed in the ocapn python test suite.
  {
    name: 'python op:deliver fetch 1',
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.referenceKit.provideRemoteObjectValue(0n),
      args: [
        makeSelector('fetch'),
        hexToArrayBuffer(
          '676930324931716768497750694b474b6c654351414f687079335a7459527042',
        ),
      ],
      answerPosition: false,
      resolveMeDesc: testKit.makeLocalObject(1n),
    }),
    makeExpectedValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeLocalObject(0n),
      args: [
        makeSelector('fetch'),
        hexToArrayBuffer(
          '676930324931716768497750694b474b6c654351414f687079335a7459527042',
        ),
      ],
      answerPosition: false,
      resolveMeDesc: testKit.referenceKit.provideRemoteObjectValue(1n),
    }),
  },
  {
    name: 'python op:deliver fetch 2',
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.referenceKit.provideRemoteObjectValue(0n),
      args: [
        makeSelector('fetch'),
        hexToArrayBuffer(
          '564d44446431766f4b5761724365324776674c627862564679734e7a52507a78',
        ),
      ],
      answerPosition: false,
      resolveMeDesc: testKit.makeLocalObject(1n),
    }),
    makeExpectedValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeLocalObject(0n),
      args: [
        makeSelector('fetch'),
        hexToArrayBuffer(
          '564d44446431766f4b5761724365324776674c627862564679734e7a52507a78',
        ),
      ],
      answerPosition: false,
      resolveMeDesc: testKit.referenceKit.provideRemoteObjectValue(1n),
    }),
  },
  {
    name: 'python op:deliver-only fulfill',
    makeValue: testKit => ({
      type: 'op:deliver-only',
      to: testKit.referenceKit.provideRemoteObjectValue(0n),
      args: [testKit.makeLocalObject(1n)],
    }),
    makeExpectedValue: testKit => ({
      type: 'op:deliver-only',
      to: testKit.makeLocalObject(0n),
      args: [testKit.referenceKit.provideRemoteObjectValue(1n)],
    }),
  },
  {
    name: 'python op:deliver deposit-gift',
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.referenceKit.provideRemoteObjectValue(0n),
      args: [
        makeSelector('fetch'),
        hexToArrayBuffer(
          '494f35386c316c61547968637267444b62457a464f4f33324d4464367a453577',
        ),
      ],
      answerPosition: false,
      resolveMeDesc: testKit.makeLocalObject(1n),
    }),
    makeExpectedValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeLocalObject(0n),
      args: [
        makeSelector('fetch'),
        hexToArrayBuffer(
          '494f35386c316c61547968637267444b62457a464f4f33324d4464367a453577',
        ),
      ],
      answerPosition: false,
      resolveMeDesc: testKit.referenceKit.provideRemoteObjectValue(1n),
    }),
  },
  {
    name: 'python op:deliver foo',
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.referenceKit.provideRemoteObjectValue(0n),
      args: harden([
        makeSelector('foo'),
        1n,
        false,
        uint8ArrayToImmutableArrayBuffer(Uint8Array.from([0x62, 0x61, 0x72])),
        ['baz'],
      ]),
      answerPosition: false,
      resolveMeDesc: testKit.makeLocalObject(1n),
    }),
    makeExpectedValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeLocalObject(0n),
      args: [
        makeSelector('foo'),
        1n,
        false,
        uint8ArrayToImmutableArrayBuffer(Uint8Array.from([0x62, 0x61, 0x72])),
        ['baz'],
      ],
      answerPosition: false,
      resolveMeDesc: testKit.referenceKit.provideRemoteObjectValue(1n),
    }),
  },
  {
    name: 'python op:deliver make-car',
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.referenceKit.provideRemoteObjectValue(1n),
      args: harden([[makeSelector('red'), makeSelector('zoomracer')]]),
      answerPosition: 2n,
      resolveMeDesc: testKit.makeLocalObject(2n),
    }),
    makeExpectedValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeLocalObject(1n),
      args: harden([[makeSelector('red'), makeSelector('zoomracer')]]),
      answerPosition: 2n,
      resolveMeDesc: testKit.referenceKit.provideRemoteObjectValue(2n),
    }),
  },
  {
    name: 'python op:listen',
    makeValue: testKit => ({
      type: 'op:listen',
      to: testKit.referenceKit.provideRemotePromiseValue(1n),
      resolveMeDesc: testKit.makeLocalObject(2n),
      wantsPartial: false,
    }),
    makeExpectedValue: testKit => ({
      type: 'op:listen',
      to: testKit.makeLocalPromise(1n),
      resolveMeDesc: testKit.referenceKit.provideRemoteObjectValue(2n),
      wantsPartial: false,
    }),
  },
  {
    // <op:get <desc:export 3> "anotherField" 7>
    name: 'op:get with desc:export',
    makeValue: testKit => ({
      type: 'op:get',
      receiverDesc: testKit.referenceKit.provideRemotePromiseValue(3n),
      fieldName: 'anotherField',
      answerPosition: 7n,
    }),
    makeExpectedValue: testKit => ({
      type: 'op:get',
      receiverDesc: testKit.makeLocalPromise(3n),
      fieldName: 'anotherField',
      answerPosition: 7n,
    }),
  },
  {
    // <op:get <desc:answer 5> "fieldName" 10>
    name: 'op:get with desc:answer',
    makeValue: testKit => ({
      type: 'op:get',
      receiverDesc: testKit.makeRemoteAnswer(5n),
      fieldName: 'someField',
      answerPosition: 10n,
    }),
    makeExpectedValue: testKit => ({
      type: 'op:get',
      receiverDesc: testKit.referenceKit.provideLocalAnswerValue(5n),
      fieldName: 'someField',
      answerPosition: 10n,
    }),
  },
  {
    // <op:index <desc:export 3> 2 7>
    name: 'op:index with desc:export',
    makeValue: testKit => ({
      type: 'op:index',
      receiverDesc: testKit.referenceKit.provideRemotePromiseValue(3n),
      index: 2n,
      answerPosition: 7n,
    }),
    makeExpectedValue: testKit => ({
      type: 'op:index',
      receiverDesc: testKit.makeLocalPromise(3n),
      index: 2n,
      answerPosition: 7n,
    }),
  },
  {
    // <op:index <desc:answer 5> 0 10>
    name: 'op:index with desc:answer',
    makeValue: testKit => ({
      type: 'op:index',
      receiverDesc: testKit.makeRemoteAnswer(5n),
      index: 0n,
      answerPosition: 10n,
    }),
    makeExpectedValue: testKit => ({
      type: 'op:index',
      receiverDesc: testKit.referenceKit.provideLocalAnswerValue(5n),
      index: 0n,
      answerPosition: 10n,
    }),
  },
];

runTableTests(
  test,
  'OcapnMessageUnionCodec',
  table,
  testKit => testKit.OcapnMessageUnionCodec,
);

test('op:get rejects integer fieldName', t => {
  const testKit = makeCodecTestKit();
  const syrupWriter = makeSyrupWriter({
    name: 'op:get with integer fieldName',
  });

  const invalidMessage = {
    type: 'op:get',
    receiverDesc: testKit.referenceKit.provideRemotePromiseValue(3n),
    fieldName: 42n, // Should be a string, not an integer
    answerPosition: 7n,
  };

  const error = t.throws(
    () => {
      testKit.OcapnMessageUnionCodec.write(invalidMessage, syrupWriter);
    },
    undefined,
    'op:get should reject integer fieldName',
  );

  // Verify the error chain contains the fieldName failure
  const cause1 = /** @type {Error} */ (error.cause);
  const cause2 = /** @type {Error} */ (cause1.cause);
  t.regex(cause2.message, /OpGet: write failed for field fieldName/);
});

test('op:index rejects string index', t => {
  const testKit = makeCodecTestKit();
  const syrupWriter = makeSyrupWriter({ name: 'op:index with string index' });

  const invalidMessage = {
    type: 'op:index',
    receiverDesc: testKit.referenceKit.provideRemotePromiseValue(3n),
    index: 'notAnIndex', // Should be an integer, not a string
    answerPosition: 7n,
  };

  const error = t.throws(
    () => {
      testKit.OcapnMessageUnionCodec.write(invalidMessage, syrupWriter);
    },
    undefined,
    'op:index should reject string index',
  );

  // Verify the error chain contains the index failure
  const cause1 = /** @type {Error} */ (error.cause);
  const cause2 = /** @type {Error} */ (cause1.cause);
  t.regex(cause2.message, /OpIndex: write failed for field index/);
});
