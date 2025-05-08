// @ts-check

/** @typedef {import('../../src/syrup/decode.js').SyrupReader} SyrupReader */
/** @typedef {import('../../src/syrup/encode.js').SyrupWriter} SyrupWriter */
/** @typedef {import('../../src/syrup/codec.js').SyrupCodec} SyrupCodec */
/** @typedef {import('@endo/eventual-send').Settler} Settler */
/** @typedef {import('./_codecs_util.js').CodecTestEntry} CodecTestEntry */

import test from '@endo/ses-ava/prepare-endo.js';

import { makeSelector } from '../../src/pass-style-helpers.js';
import {
  sel,
  str,
  bool,
  int,
  list,
  makeSig,
  makeNode,
  makePubKey,
  makeDescGive,
  makeHandoffReceive,
  strToUint8Array,
  makeExport,
  makeImportObject,
  makeImportPromise,
  record,
  hexToUint8Array,
  btsStr,
  examplePubKeyQBytes,
  exampleSigParamBytes,
} from './_syrup_util.js';
import { makeCodecTestKit, testBidirectionally } from './_codecs_util.js';

/**
 * @typedef {Omit<CodecTestEntry, 'codec'> & { makeValue?: (testKit: ReturnType<typeof makeCodecTestKit>) => any }} OperationTestEntry
 *
 * @type {OperationTestEntry[]}
 */
export const table = [
  {
    // <op:start-session captp-version             ; String value
    //                   session-pubkey            ; CapTP public key value
    //                   acceptable-location       ; OCapN Reference type
    //                   acceptable-location-sig>  ; CapTP signature
    syrup: record(
      'op:start-session',
      str('captp-v1'),
      makePubKey(examplePubKeyQBytes),
      makeNode('tcp', '127.0.0.1', false),
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
        type: 'ocapn-node',
        transport: 'tcp',
        address: '127.0.0.1',
        hints: false,
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
    syrup: `<${sel('op:deliver')}${makeExport(0)}${list([
      sel('withdraw-gift'),
      makeHandoffReceive(
        strToUint8Array('123'),
        strToUint8Array('456'),
        1,
        makeDescGive(
          makePubKey(examplePubKeyQBytes),
          makeNode('tcp', '127.0.0.1', false),
          strToUint8Array('exporter-session-id'),
          strToUint8Array('gifter-side-id'),
          strToUint8Array('gift-id'),
        ),
        makeSig(exampleSigParamBytes, exampleSigParamBytes),
      ),
    ])}${int(1)}${makeImportObject(3)}>`,
    makeValue: testKit => ({
      type: 'op:deliver',
      to: testKit.makeExportAt(0n),
      args: [
        makeSelector('withdraw-gift'),
        {
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
      ],
      answerPosition: 1n,
      resolveMeDesc: testKit.tableKit.provideRemoteResolver(3n),
    }),
  },
  {
    // <op:pick <promise-pos>         ; <desc:answer | desc:import-promise>
    //          <selected-value-pos>  ; Positive Integer
    //          <new-answer-pos>>     ; Positive Integer
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
    syrup: `<${sel('op:gc-answer')}${int(1)}>`,
    value: {
      type: 'op:gc-answer',
      answerPosition: 1n,
    },
    skipWrite: false,
  },
  // Below are examples from the ocapn python test suite
  {
    syrup: hexToUint8Array(
      '3c3136276f703a73746172742d73657373696f6e323222696e76616c69642d76657273696f6e2d6e756d6265725b3130277075626c69632d6b65795b33276563635b352763757276653727456432353531395d5b3527666c616773352765646473615d5b31277133323af256acb7103aab95ae410a65b996f87710400ee3c5b550abe365144a6ee7fbe85d5d5d3c3130276f6361706e2d6e6f64653136277463702d74657374696e672d6f6e6c793135223132372e302e302e313a3532383031663e5b37277369672d76616c5b352765646473615b31277233323a83566b895c0b324011bd3489b13462e420aec65a7da043083970772c79953d535d5b31277333323a624a58d082f8d6265c4e9f6195d24f58ae82f0882f4d482ce91a7e70db65030e5d5d5d3e',
    ),
    value: {
      type: 'op:start-session',
      captpVersion: 'invalid-version-number',
      sessionPublicKey: {
        type: 'public-key',
        scheme: 'ecc',
        curve: 'Ed25519',
        flags: 'eddsa',
        q: hexToUint8Array(
          'f256acb7103aab95ae410a65b996f87710400ee3c5b550abe365144a6ee7fbe8',
        ),
      },
      location: {
        type: 'ocapn-node',
        transport: 'tcp-testing-only',
        address: '127.0.0.1:52801',
        hints: false,
      },
      locationSignature: {
        type: 'sig-val',
        scheme: 'eddsa',
        r: hexToUint8Array(
          '83566b895c0b324011bd3489b13462e420aec65a7da043083970772c79953d53',
        ),
        s: hexToUint8Array(
          '624a58d082f8d6265c4e9f6195d24f58ae82f0882f4d482ce91a7e70db65030e',
        ),
      },
    },
    skipWrite: false,
  },
  {
    syrup: hexToUint8Array(
      '3c3136276f703a73746172742d73657373696f6e3322312e305b3130277075626c69632d6b65795b33276563635b352763757276653727456432353531395d5b3527666c616773352765646473615d5b31277133323ad62b9fe1138b942a61bc6941d1fbf7234b8b3d104fc11c5a2a642646124e18655d5d5d3c3130276f6361706e2d6e6f64653136277463702d74657374696e672d6f6e6c793135223132372e302e302e313a3536373132663e5b37277369672d76616c5b352765646473615b31277233323a412dcecf1a2c1d02645f2b17f8cc241e7297fb2a87b4d89a2bafcbd07a0ccfab5d5b31277333323a90cf86ad2681ad0dda3f01c2302e1144cad5d6b743643383cfd7c317f77b2c0a5d5d5d3e',
    ),
    value: {
      type: 'op:start-session',
      captpVersion: '1.0',
      sessionPublicKey: {
        type: 'public-key',
        scheme: 'ecc',
        curve: 'Ed25519',
        flags: 'eddsa',
        q: hexToUint8Array(
          'd62b9fe1138b942a61bc6941d1fbf7234b8b3d104fc11c5a2a642646124e1865',
        ),
      },
      location: {
        type: 'ocapn-node',
        transport: 'tcp-testing-only',
        address: '127.0.0.1:56712',
        hints: false,
      },
      locationSignature: {
        type: 'sig-val',
        scheme: 'eddsa',
        r: hexToUint8Array(
          '412dcecf1a2c1d02645f2b17f8cc241e7297fb2a87b4d89a2bafcbd07a0ccfab',
        ),
        s: hexToUint8Array(
          '90cf86ad2681ad0dda3f01c2302e1144cad5d6b743643383cfd7c317f77b2c0a',
        ),
      },
    },
    skipWrite: false,
  },
  {
    syrup: hexToUint8Array(
      '3c3136276f703a73746172742d73657373696f6e3322312e305b3130277075626c69632d6b65795b33276563635b352763757276653727456432353531395d5b3527666c616773352765646473615d5b31277133323a4832d7d9c21fe35b4e7f1e98ff2a6a27db53dfdb951f2fd343919cd4492799af5d5d5d3c3130276f6361706e2d6e6f64653136277463702d74657374696e672d6f6e6c793135223132372e302e302e313a3536373132663e5b37277369672d76616c5b352765646473615b31277233323a0e13783b729b49111854aedf29614bb551e1e1cea5bee50246de7edf8a368d895d5b31277333323aabf38cad0063d593a7db79de3098b2653fb197b724e7589d0cd2dd8cafeb20065d5d5d3e',
    ),
    value: {
      type: 'op:start-session',
      captpVersion: '1.0',
      sessionPublicKey: {
        type: 'public-key',
        scheme: 'ecc',
        curve: 'Ed25519',
        flags: 'eddsa',
        q: hexToUint8Array(
          '4832d7d9c21fe35b4e7f1e98ff2a6a27db53dfdb951f2fd343919cd4492799af',
        ),
      },
      location: {
        type: 'ocapn-node',
        transport: 'tcp-testing-only',
        address: '127.0.0.1:56712',
        hints: false,
      },
      locationSignature: {
        type: 'sig-val',
        scheme: 'eddsa',
        r: hexToUint8Array(
          '0e13783b729b49111854aedf29614bb551e1e1cea5bee50246de7edf8a368d89',
        ),
        s: hexToUint8Array(
          'abf38cad0063d593a7db79de3098b2653fb197b724e7589d0cd2dd8cafeb2006',
        ),
      },
    },
  },
  {
    syrup: hexToUint8Array(
      '3c3136276f703a73746172742d73657373696f6e3322312e305b3130277075626c69632d6b65795b33276563635b352763757276653727456432353531395d5b3527666c616773352765646473615d5b31277133323ac616b5d782f394686c7ffd690e9a95d35c2cd9a685d5f09bd5304d8cf57e6ca15d5d5d3c3130276f6361706e2d6e6f64653136277463702d74657374696e672d6f6e6c793135223132372e302e302e313a3536373132663e5b37277369672d76616c5b352765646473615b31277233323a546760cbb937c5483e1d1a86f44955b4972809bfcde24ead3f13fba3fa53b6a85d5b31277333323a02cdeef01497c85585c0e848a74e614fa0b2240c97538ecb88505c81ec8036015d5d5d3e',
    ),
    value: {
      type: 'op:start-session',
      captpVersion: '1.0',
      sessionPublicKey: {
        type: 'public-key',
        scheme: 'ecc',
        curve: 'Ed25519',
        flags: 'eddsa',
        q: hexToUint8Array(
          'c616b5d782f394686c7ffd690e9a95d35c2cd9a685d5f09bd5304d8cf57e6ca1',
        ),
      },
      location: {
        type: 'ocapn-node',
        transport: 'tcp-testing-only',
        address: '127.0.0.1:56712',
        hints: false,
      },
      locationSignature: {
        type: 'sig-val',
        scheme: 'eddsa',
        r: hexToUint8Array(
          '546760cbb937c5483e1d1a86f44955b4972809bfcde24ead3f13fba3fa53b6a8',
        ),
        s: hexToUint8Array(
          '02cdeef01497c85585c0e848a74e614fa0b2240c97538ecb88505c81ec803601',
        ),
      },
    },
    skipWrite: false,
  },
  {
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
  {
    syrup: hexToUint8Array(
      '3c3135276f703a64656c697665722d6f6e6c793c313127646573633a6578706f7274312b3e5b3c3135276f6361706e2d7374757264797265663c3130276f6361706e2d6e6f64653136277463702d74657374696e672d6f6e6c793135223132372e302e302e313a3635343730663e393a6d792d6f626a6563743e5d3e',
    ),
    makeValue: testKit => ({
      type: 'op:deliver-only',
      to: testKit.makeExportAt(1n),
      args: [
        {
          type: 'ocapn-sturdyref',
          node: {
            type: 'ocapn-node',
            transport: 'tcp-testing-only',
            address: '127.0.0.1:65470',
            hints: false,
          },
          swissNum: strToUint8Array('my-object'),
        },
      ],
    }),
  },
  {
    syrup: hexToUint8Array(
      '3c3135276f703a64656c697665722d6f6e6c793c313127646573633a6578706f7274312b3e5b3c313727646573633a7369672d656e76656c6f70653c313727646573633a68616e646f66662d676976655b3130277075626c69632d6b65795b33276563635b352763757276653727456432353531395d5b3527666c616773352765646473615d5b31277133323aee6f0ea527145fa7716eae012c3897a7e7189f5ec15ecbbc28b242dac194d1d45d5d5d3c3130276f6361706e2d6e6f64653136277463702d74657374696e672d6f6e6c793135223132372e302e302e313a3631303035663e33323a2efa09d73d6ebfc89049111929454185d0a84951d7205f417e5170ca0ce856c633323af850bbc2ab01359fab54c0e310984528d5692b7579339a1ce4a161bfec3a0b82373a6d792d676966743e5b37277369672d76616c5b352765646473615b31277233323aaf8535ee488efa14599e4b5a5449bff243656e5807eb176e3586126d87e298535d5b31277333323abbb8b450b1c915bc49388a42ecf9081096fbcf9445c77ca6bad5d71be52985025d5d5d3e5d3e',
    ),
    makeValue: testKit => ({
      type: 'op:deliver-only',
      to: testKit.makeExportAt(1n),
      args: [
        {
          type: 'desc:sig-envelope',
          object: {
            type: 'desc:handoff-give',
            receiverKey: {
              type: 'public-key',
              scheme: 'ecc',
              curve: 'Ed25519',
              flags: 'eddsa',
              q: hexToUint8Array(
                'ee6f0ea527145fa7716eae012c3897a7e7189f5ec15ecbbc28b242dac194d1d4',
              ),
            },
            exporterLocation: {
              type: 'ocapn-node',
              transport: 'tcp-testing-only',
              address: '127.0.0.1:61005',
              hints: false,
            },
            exporterSessionId: hexToUint8Array(
              '2efa09d73d6ebfc89049111929454185d0a84951d7205f417e5170ca0ce856c6',
            ),
            gifterSideId: hexToUint8Array(
              'f850bbc2ab01359fab54c0e310984528d5692b7579339a1ce4a161bfec3a0b82',
            ),
            giftId: hexToUint8Array('6d792d67696674'),
          },
          signature: {
            type: 'sig-val',
            scheme: 'eddsa',
            r: hexToUint8Array(
              'af8535ee488efa14599e4b5a5449bff243656e5807eb176e3586126d87e29853',
            ),
            s: hexToUint8Array(
              'bbb8b450b1c915bc49388a42ecf9081096fbcf9445c77ca6bad5d71be5298502',
            ),
          },
        },
      ],
    }),
  },
];

test('affirmative operation cases', t => {
  for (const entry of table) {
    const testKit = makeCodecTestKit();
    const { value, makeValue } = entry;
    const expectedValue = value || (makeValue && makeValue(testKit));
    const codec = testKit.OCapNMessageUnionCodec;
    testBidirectionally(t, {
      codec,
      skipWrite: true,
      ...entry,
      value: expectedValue,
    });
  }
});
