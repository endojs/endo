const sym = (s) => `${s.length}'${s}`;
const str = (s) => `${s.length}"${s}`;
const bts = (s) => `${s.length}:${s}`;
const bool = (b) => b ? 't' : 'f';
const int = (i) => `${Math.floor(Math.abs(i))}${i === 0 ? '' : i < 0 ? '-' : '+'}`;

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
];
