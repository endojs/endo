// @ts-check

import { makeTagged, makeSelector } from '../src/pass-style-helpers.js';
import {
  sel,
  str,
  bts,
  bool,
  int,
  list,
  makeSig,
  makeNode,
  makePubKey,
  makeDescGive,
  makeSigEnvelope,
  makeHandoffReceive,
  strToUint8Array,
  makeExport,
  makeImportObject,
  makeImportPromise,
  record,
  hexToUint8Array,
  btsStr,
} from './_syrup_util.js';

// I made up many of these syrup values by hand, they may be wrong, sorry.
// Other test data was taken from interactions with the OCapN python test server.

// Note that this approach uses strings to represent the binary syrup messages for readability,
// but this comes with limitations. Note that special care will be needed when working
// with binary data, such as float64 or bytestrings.

const exampleSigParamBytes = Uint8Array.from({ length: 32 }, (_, i) => i);
const examplePubKeyQBytes = hexToUint8Array(
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
);

export const componentsTable = [
  {
    syrup: makeSig(exampleSigParamBytes, exampleSigParamBytes),
    value: {
      type: 'sig-val',
      scheme: 'eddsa',
      r: exampleSigParamBytes,
      s: exampleSigParamBytes,
    },
  },
  {
    syrup: makeNode('tcp', '127.0.0.1', false),
    value: {
      type: 'ocapn-node',
      transport: 'tcp',
      address: '127.0.0.1',
      hints: false,
    },
  },
  {
    syrup: record(
      'ocapn-sturdyref',
      makeNode('tcp', '127.0.0.1', false),
      btsStr('1'),
    ),
    value: {
      type: 'ocapn-sturdyref',
      node: {
        type: 'ocapn-node',
        transport: 'tcp',
        address: '127.0.0.1',
        hints: false,
      },
      swissNum: strToUint8Array('1'),
    },
  },
  {
    syrup: makePubKey(examplePubKeyQBytes),
    value: {
      type: 'public-key',
      scheme: 'ecc',
      curve: 'Ed25519',
      flags: 'eddsa',
      q: examplePubKeyQBytes,
    },
  },
];

export const descriptorsTable = [
  {
    syrup: `<18'desc:import-object123+>`,
    value: {
      type: 'desc:import-object',
      position: 123n,
    },
  },
  {
    syrup: `<19'desc:import-promise456+>`,
    value: {
      type: 'desc:import-promise',
      position: 456n,
    },
  },
  {
    syrup: `<11'desc:export123+>`,
    value: {
      type: 'desc:export',
      position: 123n,
    },
  },
  {
    syrup: `<11'desc:answer456+>`,
    value: {
      type: 'desc:answer',
      position: 456n,
    },
  },
  {
    syrup: record(
      'desc:handoff-give',
      makePubKey(examplePubKeyQBytes),
      makeNode('tcp', '127.0.0.1', false),
      btsStr('123'),
      makePubKey(examplePubKeyQBytes),
      btsStr('456'),
    ),
    value: {
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
      session: strToUint8Array('123'),
      gifterSide: {
        type: 'public-key',
        scheme: 'ecc',
        curve: 'Ed25519',
        flags: 'eddsa',
        q: examplePubKeyQBytes,
      },
      giftId: strToUint8Array('456'),
    },
  },
  {
    syrup: record(
      'desc:sig-envelope',
      makeDescGive(
        makePubKey(examplePubKeyQBytes),
        makeNode('tcp', '127.0.0.1', false),
        strToUint8Array('123'),
        makePubKey(examplePubKeyQBytes),
        strToUint8Array('123'),
      ),
      makeSig(exampleSigParamBytes, exampleSigParamBytes),
    ),
    value: {
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
        session: strToUint8Array('123'),
        gifterSide: {
          type: 'public-key',
          scheme: 'ecc',
          curve: 'Ed25519',
          flags: 'eddsa',
          q: examplePubKeyQBytes,
        },
        giftId: strToUint8Array('123'),
      },
      signature: {
        type: 'sig-val',
        scheme: 'eddsa',
        r: exampleSigParamBytes,
        s: exampleSigParamBytes,
      },
    },
  },
  // handoff receive
  {
    syrup: record(
      'desc:handoff-receive',
      btsStr('123'),
      btsStr('456'),
      int(1),
      makeSigEnvelope(
        makeDescGive(
          makePubKey(examplePubKeyQBytes),
          makeNode('tcp', '127.0.0.1', false),
          strToUint8Array('789'),
          makePubKey(examplePubKeyQBytes),
          strToUint8Array('def'),
        ),
        makeSig(exampleSigParamBytes, exampleSigParamBytes),
      ),
    ),
    value: {
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
          session: strToUint8Array('789'),
          gifterSide: {
            type: 'public-key',
            scheme: 'ecc',
            curve: 'Ed25519',
            flags: 'eddsa',
            q: examplePubKeyQBytes,
          },
          giftId: strToUint8Array('def'),
        },
        signature: {
          type: 'sig-val',
          scheme: 'eddsa',
          r: exampleSigParamBytes,
          s: exampleSigParamBytes,
        },
      },
    },
  },
];

export const operationsTable = [
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
  },
  {
    // <op:deliver-only <desc:export 1> ['fulfill <desc:import-object 1>]>
    syrup: `<${sel('op:deliver-only')}${makeExport(1)}${list([sel('fulfill'), makeImportObject(1)])}>`,
    value: {
      type: 'op:deliver-only',
      to: {
        type: 'desc:export',
        position: 1n,
      },
      args: [
        makeSelector('fulfill'),
        {
          type: 'desc:import-object',
          position: 1n,
        },
      ],
    },
  },
  {
    // <op:deliver-only <desc:export 0>               ; Remote bootstrap object
    //                  ['deposit-gift                ; Symbol "deposit-gift"
    //                   42                           ; gift-id, a positive integer
    //                   <desc:import-object ...>]>   ; remote object being shared
    syrup: `<${sel('op:deliver-only')}${makeExport(0)}${list([sel('deposit-gift'), int(42), makeImportObject(1)])}>`,
    value: {
      type: 'op:deliver-only',
      to: {
        type: 'desc:export',
        position: 0n,
      },
      args: [
        makeSelector('deposit-gift'),
        42n,
        { type: 'desc:import-object', position: 1n },
      ],
    },
  },
  {
    // <op:deliver <desc:export 5> ['make-car-factory] 3 <desc:import-object 15>>
    syrup: `<${sel('op:deliver')}${makeExport(5)}${list([sel('make-car-factory')])}${int(3)}${makeImportObject(15)}>`,
    value: {
      type: 'op:deliver',
      to: {
        type: 'desc:export',
        position: 5n,
      },
      args: [makeSelector('make-car-factory')],
      answerPosition: 3n,
      resolveMeDesc: {
        type: 'desc:import-object',
        position: 15n,
      },
    },
  },
  {
    // <op:deliver <desc:export 1> ['beep] false <desc:import-object 2>>
    syrup: `<${sel('op:deliver')}${makeExport(1)}${list([sel('beep')])}${bool(false)}${makeImportObject(2)}>`,
    value: {
      type: 'op:deliver',
      to: {
        type: 'desc:export',
        position: 1n,
      },
      args: [makeSelector('beep')],
      answerPosition: false,
      resolveMeDesc: {
        type: 'desc:import-object',
        position: 2n,
      },
    },
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
    value: {
      type: 'op:deliver',
      to: { type: 'desc:export', position: 0n },
      args: [makeSelector('fetch'), strToUint8Array('swiss-number')],
      answerPosition: 3n,
      resolveMeDesc: {
        type: 'desc:import-object',
        position: 5n,
      },
    },
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
          strToUint8Array('789'),
          makePubKey(examplePubKeyQBytes),
          strToUint8Array('def'),
        ),
        makeSig(exampleSigParamBytes, exampleSigParamBytes),
      ),
    ])}${int(1)}${makeImportObject(3)}>`,
    value: {
      type: 'op:deliver',
      to: { type: 'desc:export', position: 0n },
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
              session: strToUint8Array('789'),
              gifterSide: {
                type: 'public-key',
                scheme: 'ecc',
                curve: 'Ed25519',
                flags: 'eddsa',
                q: examplePubKeyQBytes,
              },
              giftId: strToUint8Array('def'),
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
      resolveMeDesc: {
        type: 'desc:import-object',
        position: 3n,
      },
    },
  },
  {
    // <op:pick <promise-pos>         ; <desc:answer | desc:import-promise>
    //          <selected-value-pos>  ; Positive Integer
    //          <new-answer-pos>>     ; Positive Integer
    syrup: `<${sel('op:pick')}${makeImportPromise(1)}${int(2)}${int(3)}>`,
    value: {
      type: 'op:pick',
      promisePosition: {
        type: 'desc:import-promise',
        position: 1n,
      },
      selectedValuePosition: 2n,
      newAnswerPosition: 3n,
    },
  },
  {
    // <op:abort reason>  ; reason: String
    syrup: `<${sel('op:abort')}${str('explode')}>`,
    value: {
      type: 'op:abort',
      reason: 'explode',
    },
  },
  {
    // <op:listen to-desc           ; desc:export | desc:answer
    //            listen-desc       ; desc:import-object
    //            wants-partial?    ; boolean
    syrup: `<${sel('op:listen')}${makeExport(1)}${makeImportObject(2)}${bool(false)}>`,
    value: {
      type: 'op:listen',
      to: { type: 'desc:export', position: 1n },
      resolveMeDesc: { type: 'desc:import-object', position: 2n },
      wantsPartial: false,
    },
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
  },
  {
    // <op:gc-answer answer-pos>  ; answer-pos: positive integer
    syrup: `<${sel('op:gc-answer')}${int(1)}>`,
    value: {
      type: 'op:gc-answer',
      answerPosition: 1n,
    },
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
  },
  {
    syrup: hexToUint8Array(
      '3c3130276f703a64656c697665723c313127646573633a6578706f7274302b3e5b3527666574636833323a676930324931716768497750694b474b6c654351414f687079335a74595270425d663c313827646573633a696d706f72742d6f626a656374302b3e3e',
    ),
    value: {
      type: 'op:deliver',
      to: {
        type: 'desc:export',
        position: 0n,
      },
      args: [
        makeSelector('fetch'),
        hexToUint8Array(
          '676930324931716768497750694b474b6c654351414f687079335a7459527042',
        ),
      ],
      answerPosition: false,
      resolveMeDesc: {
        type: 'desc:import-object',
        position: 0n,
      },
    },
  },
  {
    syrup: hexToUint8Array(
      '3c3130276f703a64656c697665723c313127646573633a6578706f7274302b3e5b3527666574636833323a564d44446431766f4b5761724365324776674c627862564679734e7a52507a785d663c313827646573633a696d706f72742d6f626a656374302b3e3e',
    ),
    value: {
      type: 'op:deliver',
      to: {
        type: 'desc:export',
        position: 0n,
      },
      args: [
        makeSelector('fetch'),
        hexToUint8Array(
          '564d44446431766f4b5761724365324776674c627862564679734e7a52507a78',
        ),
      ],
      answerPosition: false,
      resolveMeDesc: {
        type: 'desc:import-object',
        position: 0n,
      },
    },
  },
  {
    syrup: hexToUint8Array(
      '3c3135276f703a64656c697665722d6f6e6c793c313127646573633a6578706f7274302b3e5b3c313827646573633a696d706f72742d6f626a656374312b3e5d3e',
    ),
    value: {
      type: 'op:deliver-only',
      to: {
        type: 'desc:export',
        position: 0n,
      },
      args: [
        {
          type: 'desc:import-object',
          position: 1n,
        },
      ],
    },
  },
  {
    syrup: hexToUint8Array(
      '3c3130276f703a64656c697665723c313127646573633a6578706f7274302b3e5b3527666574636833323a494f35386c316c61547968637267444b62457a464f4f33324d4464367a4535775d663c313827646573633a696d706f72742d6f626a656374302b3e3e',
    ),
    value: {
      type: 'op:deliver',
      to: {
        type: 'desc:export',
        position: 0n,
      },
      args: [
        makeSelector('fetch'),
        hexToUint8Array(
          '494f35386c316c61547968637267444b62457a464f4f33324d4464367a453577',
        ),
      ],
      answerPosition: false,
      resolveMeDesc: {
        type: 'desc:import-object',
        position: 0n,
      },
    },
  },
  {
    syrup: hexToUint8Array(
      '3c3130276f703a64656c697665723c313127646573633a6578706f7274302b3e5b3322666f6f312b66333a6261725b332262617a5d5d663c313827646573633a696d706f72742d6f626a656374312b3e3e',
    ),
    value: {
      type: 'op:deliver',
      to: {
        type: 'desc:export',
        position: 0n,
      },
      args: ['foo', 1n, false, Uint8Array.from([0x62, 0x61, 0x72]), ['baz']],
      answerPosition: false,
      resolveMeDesc: {
        type: 'desc:import-object',
        position: 1n,
      },
    },
  },
  {
    syrup: hexToUint8Array(
      '3c3130276f703a64656c697665723c313127646573633a616e73776572312b3e5b5b332772656439277a6f6f6d72616365725d5d322b3c313827646573633a696d706f72742d6f626a656374322b3e3e',
    ),
    value: {
      type: 'op:deliver',
      to: {
        type: 'desc:answer',
        position: 1n,
      },
      args: [[makeSelector('red'), makeSelector('zoomracer')]],
      answerPosition: 2n,
      resolveMeDesc: {
        type: 'desc:import-object',
        position: 2n,
      },
    },
  },
  {
    syrup: hexToUint8Array(
      '3c39276f703a6c697374656e3c313127646573633a6578706f7274322b3e3c313827646573633a696d706f72742d6f626a656374322b3e663e',
    ),
    value: {
      type: 'op:listen',
      to: {
        type: 'desc:export',
        position: 2n,
      },
      resolveMeDesc: {
        type: 'desc:import-object',
        position: 2n,
      },
      wantsPartial: false,
    },
  },
  {
    syrup: hexToUint8Array(
      '3c3135276f703a64656c697665722d6f6e6c793c313127646573633a6578706f7274312b3e5b3c3135276f6361706e2d7374757264797265663c3130276f6361706e2d6e6f64653136277463702d74657374696e672d6f6e6c793135223132372e302e302e313a3635343730663e393a6d792d6f626a6563743e5d3e',
    ),
    value: {
      type: 'op:deliver-only',
      to: {
        type: 'desc:export',
        position: 1n,
      },
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
    },
  },
];

export const passableTable = [
  { syrup: `<${sel('void')}>`, value: undefined },
  { syrup: `<${sel('null')}>`, value: null },
  { syrup: `${bool(true)}`, value: true },
  { syrup: `${bool(false)}`, value: false },
  { syrup: `${int(123)}`, value: 123n },
  { syrup: `${str('hello')}`, value: 'hello' },
  {
    syrup: btsStr('hello'),
    value: new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]),
  },
  {
    syrup: bts(new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f])),
    value: new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]),
  },
  {
    syrup: `${sel('hello')}`,
    value: makeSelector('hello'),
  },
  { syrup: `${list([str('hello'), str('world')])}`, value: ['hello', 'world'] },
  {
    syrup: `{${str('abc')}${int(123)}${str('xyz')}${bool(true)}}`,
    value: { abc: 123n, xyz: true },
  },
  {
    syrup: `<${sel('desc:tagged')}${sel('hello')}${list([str('world')])}>`,
    value: makeTagged('hello', ['world']),
  },
  // order canonicalization
  { syrup: '{0"10+1"i20+}', value: { '': 10n, i: 20n } },
  { syrup: '{0"10+1"i20+}', value: { i: 20n, '': 10n } },
];
