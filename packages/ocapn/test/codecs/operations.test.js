// @ts-check

/**
 * @import { CodecTestEntry } from './_codecs_util.js'
 */

import test from '@endo/ses-ava/test.js';

import { makeSelector } from '../../src/selector.js';
import {
  sel,
  str,
  bool,
  int,
  list,
  makeSig,
  makePeer,
  makePubKey,
  strToUint8Array,
  makeExport,
  makeImportObject,
  makeImportPromise,
  record,
  hexToUint8Array,
  btsStr,
  examplePubKeyQBytes,
  exampleSigParamBytes,
  makeSignedHandoffReceiveSyrup,
} from './_syrup_util.js';
import { testBidirectionally } from './_codecs_util.js';

/** @type {CodecTestEntry[]} */
export const table = [
  {
    // <op:start-session captp-version             ; String value
    //                   session-pubkey            ; CapTP public key value
    //                   acceptable-location       ; OCapN Reference type
    //                   acceptable-location-sig>  ; CapTP signature
    name: 'op:start-session',
    syrup: record(
      'op:start-session',
      str('captp-v1'),
      makePubKey(examplePubKeyQBytes),
      makePeer('tcp', '1234', { host: '127.0.0.1', port: '54822' }),
      makeSig(exampleSigParamBytes, exampleSigParamBytes),
    ),
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
    skipWrite: false,
  },
  {
    // <op:deliver-only <desc:export 1> ['fulfill <desc:import-object 1>]>
    name: 'op:deliver-only fulfill',
    syrup: `<${sel('op:deliver-only')}${makeExport(1)}${list([sel('fulfill'), makeImportObject(1)])}>`,
    makeValue: testKit => ({
      type: 'op:deliver-only',
      to: testKit.makeExportAt(1n),
      args: [
        makeSelector('fulfill'),
        testKit.tableKit.convertPositionToRemoteVal(1n),
      ],
    }),
  },
  {
    // <op:deliver-only <desc:export 0>               ; Remote bootstrap object
    //                  ['deposit-gift                ; Symbol "deposit-gift"
    //                   42                           ; gift-id, a positive integer
    //                   <desc:import-object ...>]>   ; remote object being shared
    name: 'op:deliver-only deposit-gift',
    syrup: `<${sel('op:deliver-only')}${makeExport(0)}${list([sel('deposit-gift'), int(42), makeImportObject(1)])}>`,
    makeValue: testKit => ({
      type: 'op:deliver-only',
      to: testKit.makeExportAt(0n),
      args: [
        makeSelector('deposit-gift'),
        42n,
        testKit.tableKit.convertPositionToRemoteVal(1n),
      ],
    }),
  },
  {
    // <op:deliver <desc:export 5> ['make-car-factory] 3 <desc:import-object 15>>
    name: 'op:deliver make-car-factory',
    syrup: `<${sel('op:deliver')}${makeExport(5)}${list([sel('make-car-factory')])}${int(3)}${makeImportObject(15)}>`,
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeExportAt(5n),
      args: [makeSelector('make-car-factory')],
      answerPosition: 3n,
      resolveMeDesc: testKit.tableKit.provideRemoteResolver(15n),
    }),
  },
  {
    // <op:deliver <desc:export 1> ['beep] false <desc:import-object 2>>
    name: 'op:deliver beep',
    syrup: `<${sel('op:deliver')}${makeExport(1)}${list([sel('beep')])}${bool(false)}${makeImportObject(2)}>`,
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeExportAt(1n),
      args: [makeSelector('beep')],
      answerPosition: false,
      resolveMeDesc: testKit.tableKit.provideRemoteResolver(2n),
    }),
  },
  {
    // <op:deliver <desc:export 0>          ; Remote bootstrap object
    //             ['fetch                  ; Argument 1: Symbol "fetch"
    //              swiss-number]           ; Argument 2: Binary Data
    //             3                        ; Answer position: positive integer
    //             <desc:import-object 5>>  ; object exported by us at position 5 should provide the answer
    name: 'op:deliver fetch',
    syrup: `<${sel('op:deliver')}${makeExport(0)}${list([
      sel('fetch'),
      btsStr('swiss-number'),
    ])}${int(3)}${makeImportObject(5)}>`,
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeExportAt(0n),
      args: [makeSelector('fetch'), strToUint8Array('swiss-number')],
      answerPosition: 3n,
      resolveMeDesc: testKit.tableKit.provideRemoteResolver(5n),
    }),
  },
  {
    // <op:deliver <desc:export 0>           ; Remote bootstrap object
    //             [withdraw-gift            ; Argument 1: Symbol "withdraw-gift"
    //              <desc:handoff-receive>]  ; Argument 2: desc:handoff-receive
    //             1                         ; Answer position: Positive integer or false
    //             <desc:import-object 3>>   ; The object exported (by us) at position 3, should receive the gift.
    name: 'op:deliver withdraw-gift',
    syrup: `<${sel('op:deliver')}${makeExport(0)}${list([
      sel('withdraw-gift'),
      makeSignedHandoffReceiveSyrup(),
    ])}${int(1)}${makeImportObject(3)}>`,
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeExportAt(0n),
      args: [
        makeSelector('withdraw-gift'),
        {
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
                  type: 'ocapn-peer',
                  transport: 'tcp',
                  designator: '1234',
                  hints: { host: '127.0.0.1', port: '54822' },
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
        },
      ],
      answerPosition: 1n,
      resolveMeDesc: testKit.tableKit.provideRemoteResolver(3n),
    }),
  },
  {
    // <op:pick <promise-pos>         ; <desc:answer | desc:import-promise>
    //          <selected-value-pos>  ; Positive Integer
    //          <new-answer-pos>>     ; Positive Integer
    name: 'op:pick',
    syrup: `<${sel('op:pick')}${makeImportPromise(1)}${int(2)}${int(3)}>`,
    makeValue: testKit => ({
      type: 'op:pick',
      promisePosition: testKit.tableKit.provideRemotePromise(1n),
      selectedValuePosition: 2n,
      newAnswerPosition: 3n,
    }),
  },
  {
    // <op:abort reason>  ; reason: String
    name: 'op:abort',
    syrup: `<${sel('op:abort')}${str('explode')}>`,
    value: {
      type: 'op:abort',
      reason: 'explode',
    },
    skipWrite: false,
  },
  {
    // <op:listen to-desc           ; desc:export | desc:answer
    //            listen-desc       ; desc:import-object
    //            wants-partial?    ; boolean
    name: 'op:listen',
    syrup: `<${sel('op:listen')}${makeExport(1)}${makeImportObject(2)}${bool(false)}>`,
    makeValue: testKit => ({
      type: 'op:listen',
      to: testKit.makeExportAt(1n),
      resolveMeDesc: testKit.tableKit.provideRemoteResolver(2n),
      wantsPartial: false,
    }),
  },
  {
    // <op:gc-export export-pos   ; positive integer
    //               wire-delta>  ; positive integer
    name: 'op:gc-export',
    syrup: `<${sel('op:gc-export')}${int(1)}${int(2)}>`,
    value: {
      type: 'op:gc-export',
      exportPosition: 1n,
      wireDelta: 2n,
    },
    skipWrite: false,
  },
  {
    // <op:gc-answer answer-pos>  ; answer-pos: positive integer
    name: 'op:gc-answer',
    syrup: `<${sel('op:gc-answer')}${int(1)}>`,
    value: {
      type: 'op:gc-answer',
      answerPosition: 1n,
    },
    skipWrite: false,
  },
  // Below are binary messages generated from the ocapn python test suite.
  // These are brittle to spec changes and can be removed if the breakage is confirmed expected.
  {
    name: 'python op:deliver fetch 1',
    syrup: hexToUint8Array(
      '3c3130276f703a64656c697665723c313127646573633a6578706f7274302b3e5b3527666574636833323a676930324931716768497750694b474b6c654351414f687079335a74595270425d663c313827646573633a696d706f72742d6f626a656374302b3e3e',
    ),
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeExportAt(0n),
      args: [
        makeSelector('fetch'),
        hexToUint8Array(
          '676930324931716768497750694b474b6c654351414f687079335a7459527042',
        ),
      ],
      answerPosition: false,
      resolveMeDesc: testKit.tableKit.provideRemoteResolver(0n),
    }),
  },
  {
    name: 'python op:deliver fetch 2',
    syrup: hexToUint8Array(
      '3c3130276f703a64656c697665723c313127646573633a6578706f7274302b3e5b3527666574636833323a564d44446431766f4b5761724365324776674c627862564679734e7a52507a785d663c313827646573633a696d706f72742d6f626a656374302b3e3e',
    ),
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeExportAt(0n),
      args: [
        makeSelector('fetch'),
        hexToUint8Array(
          '564d44446431766f4b5761724365324776674c627862564679734e7a52507a78',
        ),
      ],
      answerPosition: false,
      resolveMeDesc: testKit.tableKit.provideRemoteResolver(0n),
    }),
  },
  {
    name: 'python op:deliver-only fulfill',
    syrup: hexToUint8Array(
      '3c3135276f703a64656c697665722d6f6e6c793c313127646573633a6578706f7274302b3e5b3c313827646573633a696d706f72742d6f626a656374312b3e5d3e',
    ),
    makeValue: testKit => ({
      type: 'op:deliver-only',
      to: testKit.makeExportAt(0n),
      args: [testKit.tableKit.provideRemoteResolver(1n)],
    }),
  },
  {
    name: 'python op:deliver deposit-gift',
    syrup: hexToUint8Array(
      '3c3130276f703a64656c697665723c313127646573633a6578706f7274302b3e5b3527666574636833323a494f35386c316c61547968637267444b62457a464f4f33324d4464367a4535775d663c313827646573633a696d706f72742d6f626a656374302b3e3e',
    ),
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeExportAt(0n),
      args: [
        makeSelector('fetch'),
        hexToUint8Array(
          '494f35386c316c61547968637267444b62457a464f4f33324d4464367a453577',
        ),
      ],
      answerPosition: false,
      resolveMeDesc: testKit.tableKit.provideRemoteResolver(0n),
    }),
  },
  {
    name: 'python op:deliver foo',
    syrup: hexToUint8Array(
      '3c3130276f703a64656c697665723c313127646573633a6578706f7274302b3e5b3322666f6f312b66333a6261725b332262617a5d5d663c313827646573633a696d706f72742d6f626a656374312b3e3e',
    ),
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeExportAt(0n),
      args: ['foo', 1n, false, Uint8Array.from([0x62, 0x61, 0x72]), ['baz']],
      answerPosition: false,
      resolveMeDesc: testKit.tableKit.provideRemoteResolver(0n),
    }),
  },
  {
    name: 'python op:deliver make-car',
    syrup: hexToUint8Array(
      '3c3130276f703a64656c697665723c313127646573633a616e73776572312b3e5b5b332772656439277a6f6f6d72616365725d5d322b3c313827646573633a696d706f72742d6f626a656374322b3e3e',
    ),
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeAnswerAt(1n),
      args: [[makeSelector('red'), makeSelector('zoomracer')]],
      answerPosition: 2n,
      resolveMeDesc: testKit.tableKit.provideRemoteResolver(2n),
    }),
  },
  {
    name: 'python op:listen',
    syrup: hexToUint8Array(
      '3c39276f703a6c697374656e3c313127646573633a6578706f7274322b3e3c313827646573633a696d706f72742d6f626a656374322b3e663e',
    ),
    makeValue: testKit => ({
      type: 'op:listen',
      to: testKit.makeExportAt(2n),
      resolveMeDesc: testKit.tableKit.provideRemoteResolver(2n),
      wantsPartial: false,
    }),
  },
];

test('affirmative operation cases', t => {
  for (const [index, entry] of table.entries()) {
    const { name = `test-${index}` } = entry;
    testBidirectionally(t, {
      ...entry,
      name,
      getCodec: testKit => testKit.OcapnMessageUnionCodec,
      skipWrite: true,
    });
  }
});
