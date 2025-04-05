const sym = (s) => `${s.length}'${s}`;
const str = (s) => `${s.length}"${s}`;
const bts = (s) => `${s.length}:${s}`;
const bool = (b) => b ? 't' : 'f';
const int = (i) => `${Math.floor(Math.abs(i))}${i < 0 ? '-' : '+'}`;
const list = (items) => `[${items.join('')}]`;
const makeNode = (transport, address, hints) => {
  return `<10'ocapn-node${sym(transport)}${bts(address)}${bool(hints)}>`;
}

const makePubKey = (scheme, curve, flags, q) => {
  return `<${sym('public-key')}${sym(scheme)}${sym(curve)}${sym(flags)}${bts(q)}>`;
}

const makeSigComp = (label, value) => {
  return `${sym(label)}${bts(value)}`;
}

const makeSig = (scheme, r, s) => {
  return `<${sym('sig-val')}${sym(scheme)}${makeSigComp('r', r)}${makeSigComp('s', s)}>`;
}

const makeExport = (position) => {
  return `<${sym('desc:export')}${int(position)}>`;
}

const makeImport = (position) => {
  return `<${sym('desc:import-object')}${int(position)}>`;
}

const strToUint8Array = (str) => {
  return new Uint8Array(str.split('').map(c => c.charCodeAt(0)));
}

export const componentsTable = [
  {
    syrup: `${makeSig('eddsa', '1', '2')}`,
    value: {
      type: 'sig-val',
      scheme: 'eddsa',
      r: new Uint8Array([0x31]),
      s: new Uint8Array([0x32])
    }
  },
];

// I made up these syrup values by hand, they may be wrong, sorry.
// Would like external test data for this.
export const descriptorsTable = [
  {
    syrup: `<10'ocapn-node3'tcp1:0f>`,
    value: {
      type: 'ocapn-node',
      transport: 'tcp',
      address: new Uint8Array([0x30]),
      hints: false
    }
  },
  {
    syrup: `<15'ocapn-sturdyref${makeNode('tcp', '0', false)}${str('1')}>`,
    value: {
      type: 'ocapn-sturdyref',
      node: {
        type: 'ocapn-node',
        transport: 'tcp',
        address: new Uint8Array([0x30]),
        hints: false
      },
      swissNum: '1'
    }
  },
  {
    syrup: makePubKey('ecc', 'Ed25519', 'eddsa', '1'),
    value: {
      type: 'public-key',
      scheme: 'ecc',
      curve: 'Ed25519',
      flags: 'eddsa',
      q: new Uint8Array([0x31])
    }
  },
  // any
  // {
  //   syrup: '<17\'desc:sig-envelope123+>',
  //   value: {
  //     type: 'desc:sig-envelope',
  //     object: {
  //       type: 'desc:handoff-give',
  //       receiverKey: {
  //         type: 'public-key',
  //         scheme: 'ed25519',
  //         curve: 'ed25519',
  //         flags: 'ed25519',
  //         q: new Uint8Array(32)
  //       },
  //       exporterLocation: {
  //         type: 'ocapn-node',
  //         transport: 'tcp',
  //         address: '127.0.0.1',
  //         hints: false
  //       },
  //       session: new Uint8Array(32),
  //       gifterSide: {
  //         type: 'public-key',
  //         scheme: 'ed25519',
  //         curve: 'ed25519',
  //         flags: 'ed25519',
  //         q: new Uint8Array(32)
  //       },
  //       giftId: new Uint8Array(32)
  //     },
  //     signature: new Uint8Array(32)
  //   }
  // },
  {
    syrup: `<18'desc:import-object123+>`,
    value: {
      type: 'desc:import-object',
      position: 123n
    }
  },
  {
    syrup: `<19'desc:import-promise456+>`,
    value: {
      type: 'desc:import-promise',
      position: 456n
    }
  },
  {
    syrup: `<11'desc:export123+>`,
    value: {
      type: 'desc:export',
      position: 123n
    }
  },
  {
    syrup: `<11'desc:answer456+>`,
    value: {
      type: 'desc:answer',
      position: 456n
    }
  },
  {
    syrup: `<${sym('desc:handoff-give')}${makePubKey('ecc', 'Ed25519', 'eddsa', '1')}${makeNode('tcp', '127.0.0.1', false)}${bts('123')}${makePubKey('ecc', 'Ed25519', 'eddsa', '2')}${bts('456')}>`,
    value: {
      type: 'desc:handoff-give',
      receiverKey: { type: 'public-key', scheme: 'ecc', curve: 'Ed25519', flags: 'eddsa', q: new Uint8Array([0x31]) },
      exporterLocation: {
        type: 'ocapn-node',
        transport: 'tcp',
        address: new Uint8Array([0x31, 0x32, 0x37, 0x2e, 0x30, 0x2e, 0x30, 0x2e, 0x31]),
        hints: false
      },
      session: new Uint8Array([0x31, 0x32, 0x33]),
      gifterSide: {
        type: 'public-key',
        scheme: 'ecc',
        curve: 'Ed25519',
        flags: 'eddsa',
        q: new Uint8Array([0x32])
      },
      giftId: new Uint8Array([0x34, 0x35, 0x36])
    }
  },
  // TODO: desc:handoff-receive, needs desc:sig-envelope
  // { syrup: `<${sym('desc:handoff-receive')}${bts('123')}${bts('456')}${int(1)}${makeSig()}>`, value: { type: 'desc:handoff-receive', receivingSession: '123', receivingSide: '456' } },
];

export const operationsTable = [
  { syrup: '<8\'op:abort7"explode>', value: { type: 'op:abort', reason: 'explode' } },
  {
    // <op:deliver-only <desc:export 1> ['fulfill <desc:import-object 1>]>
    syrup: `<${sym('op:deliver-only')}${makeExport(1)}${list([sym('fulfill'), makeImport(1)])}>`,
    value: {
      type: 'op:deliver-only',
      to: {
        type: 'desc:export',
        position: 1n
      },
      args: [
        'fulfill',
        {
          type: 'desc:import-object',
          position: 1n
        }
      ]
    }
  },
  {
    // <op:deliver-only <desc:export 0>               ; Remote bootstrap object
    //                ['deposit-gift                ; Symbol "deposit-gift"
    //                 42                           ; gift-id, a positive integer
    //                 <desc:import-object ...>]>   ; remote object being shared
    syrup: `<${sym('op:deliver-only')}${makeExport(0)}${list([sym('deposit-gift'), int(42), makeImport(1)])}>`,
    value: {
      type: 'op:deliver-only',
      to: {
        type: 'desc:export',
        position: 0n
      },
      args: [
        'deposit-gift',
        42n,
        { type: 'desc:import-object', position: 1n }
      ]
    }
  },
  {
    // <op:deliver <desc:export 5> ['make-car-factory] 3 <desc:import-object 15>>
    syrup: `<${sym('op:deliver')}${makeExport(5)}${list([sym('make-car-factory')])}${int(3)}${makeImport(15)}>`,
    value: {
      type: 'op:deliver',
      to: {
        type: 'desc:export',
        position: 5n
      },
      args: ['make-car-factory'],
      answerPosition: 3n,
      resolveMeDesc: {
        type: 'desc:import-object',
        position: 15n
      },
    }
  },
  {
    // <op:deliver <desc:export 1> ['beep] false <desc:import-object 2>>
    syrup: `<${sym('op:deliver')}${makeExport(1)}${list([sym('beep')])}${bool(false)}${makeImport(2)}>`,
    value: {
      type: 'op:deliver',
      to: {
        type: 'desc:export',
        position: 1n
      },
      args: ['beep'],
      answerPosition: false,
      resolveMeDesc: {
        type: 'desc:import-object',
        position: 2n
      }
    }
  },
  {
    // <op:deliver <desc:export 0>          ; Remote bootstrap object
    //             ['fetch                  ; Argument 1: Symbol "fetch"
    //              swiss-number]           ; Argument 2: Binary Data
    //             3                        ; Answer position: positive integer
    //             <desc:import-object 5>>  ; object exported by us at position 5 should provide the answer
    syrup: `<${sym('op:deliver')}${makeExport(0)}${list([sym('fetch'), bts('swiss-number')])}${int(3)}${makeImport(5)}>`,
    value: {
      type: 'op:deliver',
      to: { type: 'desc:export', position: 0n },
      args: ['fetch', strToUint8Array('swiss-number')],
      answerPosition: 3n,
      resolveMeDesc: {
        type: 'desc:import-object',
        position: 5n
      }
    }
  }
];
