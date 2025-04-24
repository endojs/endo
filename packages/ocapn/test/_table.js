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
} from './_syrup_util.js';

// I made up these syrup values by hand, they may be wrong, sorry.
// Would like external test data for this.

// Note that this approach uses strings to represent the binary syrup messages for readability,
// but this comes with limitations. Note that special care will be needed when working
// with binary data, such as float64 or bytestrings.

export const componentsTable = [
  {
    syrup: `${makeSig('eddsa', '1', '2')}`,
    value: {
      type: 'sig-val',
      scheme: 'eddsa',
      r: new Uint8Array([0x31]),
      s: new Uint8Array([0x32]),
    },
  },
  {
    syrup: `<10'ocapn-node3'tcp1:0f>`,
    value: {
      type: 'ocapn-node',
      transport: 'tcp',
      address: new Uint8Array([0x30]),
      hints: false,
    },
  },
  {
    syrup: `<15'ocapn-sturdyref${makeNode('tcp', '0', false)}${str('1')}>`,
    value: {
      type: 'ocapn-sturdyref',
      node: {
        type: 'ocapn-node',
        transport: 'tcp',
        address: new Uint8Array([0x30]),
        hints: false,
      },
      swissNum: '1',
    },
  },
  {
    syrup: makePubKey('ecc', 'Ed25519', 'eddsa', '1'),
    value: {
      type: 'public-key',
      scheme: 'ecc',
      curve: 'Ed25519',
      flags: 'eddsa',
      q: strToUint8Array('1'),
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
    syrup: `<${sel('desc:handoff-give')}${makePubKey('ecc', 'Ed25519', 'eddsa', '1')}${makeNode('tcp', '127.0.0.1', false)}${bts('123')}${makePubKey('ecc', 'Ed25519', 'eddsa', '2')}${bts('456')}>`,
    value: {
      type: 'desc:handoff-give',
      receiverKey: {
        type: 'public-key',
        scheme: 'ecc',
        curve: 'Ed25519',
        flags: 'eddsa',
        q: new Uint8Array([0x31]),
      },
      exporterLocation: {
        type: 'ocapn-node',
        transport: 'tcp',
        address: new Uint8Array([
          0x31, 0x32, 0x37, 0x2e, 0x30, 0x2e, 0x30, 0x2e, 0x31,
        ]),
        hints: false,
      },
      session: new Uint8Array([0x31, 0x32, 0x33]),
      gifterSide: {
        type: 'public-key',
        scheme: 'ecc',
        curve: 'Ed25519',
        flags: 'eddsa',
        q: new Uint8Array([0x32]),
      },
      giftId: new Uint8Array([0x34, 0x35, 0x36]),
    },
  },
  {
    syrup: `<${sel('desc:sig-envelope')}${makeDescGive(
      makePubKey('ed25519', 'ed25519', 'ed25519', '123'),
      makeNode('tcp', '127.0.0.1', false),
      '123',
      makePubKey('ed25519', 'ed25519', 'ed25519', '123'),
      '123',
    )}${makeSig('eddsa', '1', '2')}>`,
    value: {
      type: 'desc:sig-envelope',
      object: {
        type: 'desc:handoff-give',
        receiverKey: {
          type: 'public-key',
          scheme: 'ed25519',
          curve: 'ed25519',
          flags: 'ed25519',
          q: strToUint8Array('123'),
        },
        exporterLocation: {
          type: 'ocapn-node',
          transport: 'tcp',
          address: strToUint8Array('127.0.0.1'),
          hints: false,
        },
        session: strToUint8Array('123'),
        gifterSide: {
          type: 'public-key',
          scheme: 'ed25519',
          curve: 'ed25519',
          flags: 'ed25519',
          q: strToUint8Array('123'),
        },
        giftId: strToUint8Array('123'),
      },
      signature: {
        type: 'sig-val',
        scheme: 'eddsa',
        r: strToUint8Array('1'),
        s: strToUint8Array('2'),
      },
    },
  },
  // handoff receive
  {
    syrup: `<${sel('desc:handoff-receive')}${bts('123')}${bts('456')}${int(1)}${makeSigEnvelope(
      makeDescGive(
        makePubKey('ecc', 'Ed25519', 'eddsa', '123'),
        makeNode('tcp', '456', false),
        '789',
        makePubKey('ecc', 'Ed25519', 'eddsa', 'abc'),
        'def',
      ),
      makeSig('eddsa', '1', '2'),
    )}>`,
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
            q: strToUint8Array('123'),
          },
          exporterLocation: {
            type: 'ocapn-node',
            transport: 'tcp',
            address: strToUint8Array('456'),
            hints: false,
          },
          session: strToUint8Array('789'),
          gifterSide: {
            type: 'public-key',
            scheme: 'ecc',
            curve: 'Ed25519',
            flags: 'eddsa',
            q: strToUint8Array('abc'),
          },
          giftId: strToUint8Array('def'),
        },
        signature: {
          type: 'sig-val',
          scheme: 'eddsa',
          r: strToUint8Array('1'),
          s: strToUint8Array('2'),
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
    syrup: `<${sel('op:start-session')}${str('captp-v1')}${makePubKey('ecc', 'Ed25519', 'eddsa', '123')}${makeNode('tcp', '127.0.0.1', false)}${makeSig('eddsa', '1', '2')}>`,
    value: {
      type: 'op:start-session',
      captpVersion: 'captp-v1',
      sessionPublicKey: {
        type: 'public-key',
        scheme: 'ecc',
        curve: 'Ed25519',
        flags: 'eddsa',
        q: strToUint8Array('123'),
      },
      location: {
        type: 'ocapn-node',
        transport: 'tcp',
        address: strToUint8Array('127.0.0.1'),
        hints: false,
      },
      locationSignature: {
        type: 'sig-val',
        scheme: 'eddsa',
        r: strToUint8Array('1'),
        s: strToUint8Array('2'),
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
        'fulfill',
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
      args: ['deposit-gift', 42n, { type: 'desc:import-object', position: 1n }],
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
      args: ['make-car-factory'],
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
      args: ['beep'],
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
      bts('swiss-number'),
    ])}${int(3)}${makeImportObject(5)}>`,
    value: {
      type: 'op:deliver',
      to: { type: 'desc:export', position: 0n },
      args: ['fetch', strToUint8Array('swiss-number')],
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
        '123',
        '456',
        1,
        makeDescGive(
          makePubKey('ecc', 'Ed25519', 'eddsa', '123'),
          makeNode('tcp', '456', false),
          '789',
          makePubKey('ecc', 'Ed25519', 'eddsa', 'abc'),
          'def',
        ),
        makeSig('eddsa', '1', '2'),
      ),
    ])}${int(1)}${makeImportObject(3)}>`,
    value: {
      type: 'op:deliver',
      to: { type: 'desc:export', position: 0n },
      args: [
        'withdraw-gift',
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
                q: strToUint8Array('123'),
              },
              exporterLocation: {
                type: 'ocapn-node',
                transport: 'tcp',
                address: strToUint8Array('456'),
                hints: false,
              },
              session: strToUint8Array('789'),
              gifterSide: {
                type: 'public-key',
                scheme: 'ecc',
                curve: 'Ed25519',
                flags: 'eddsa',
                q: strToUint8Array('abc'),
              },
              giftId: strToUint8Array('def'),
            },
            signature: {
              type: 'sig-val',
              scheme: 'eddsa',
              r: strToUint8Array('1'),
              s: strToUint8Array('2'),
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
];

export const passableTable = [
  { syrup: `<${sel('void')}>`, value: undefined },
  { syrup: `<${sel('null')}>`, value: null },
  { syrup: `${bool(true)}`, value: true },
  { syrup: `${bool(false)}`, value: false },
  { syrup: `${int(123)}`, value: 123n },
  { syrup: `${str('hello')}`, value: 'hello' },
  {
    syrup: `${bts('hello')}`,
    value: new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]),
  },
  {
    syrup: `${sel('hello')}`,
    value: {
      [Symbol.for('passStyle')]: 'selector',
      [Symbol.toStringTag]: 'hello',
    },
  },
  { syrup: `${list([str('hello'), str('world')])}`, value: ['hello', 'world'] },
  {
    syrup: `{${str('abc')}${int(123)}${str('xyz')}${bool(true)}}`,
    value: { abc: 123n, xyz: true },
  },
  {
    syrup: `<${sel('desc:tagged')}${sel('hello')}${list([str('world')])}>`,
    value: {
      [Symbol.for('passStyle')]: 'tagged',
      [Symbol.toStringTag]: 'hello',
      value: ['world'],
    },
  },
  // order canonicalization
  { syrup: '{0"10+1"i20+}', value: { '': 10n, i: 20n } },
  { syrup: '{0"10+1"i20+}', value: { i: 20n, '': 10n } },
];
