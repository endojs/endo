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

// I made up these syrup values by hand, they may be wrong, sorry.
// Would like external test data for this.
export const descriptorsTable = [
  { syrup: `<10'ocapn-node3'tcp1:0f>`, value: { type: 'ocapn-node', transport: 'tcp', address: '0', hints: false } },
  { syrup: `<15'ocapn-sturdyref${makeNode('tcp', '0', false)}${str('1')}>`, value: { type: 'ocapn-sturdyref', node: { type: 'ocapn-node', transport: 'tcp', address: '0', hints: false }, swissNum: '1' } },
  { syrup: makePubKey('ecc', 'Ed25519', 'eddsa', '1'), value: { type: 'public-key', scheme: 'ecc', curve: 'Ed25519', flags: 'eddsa', q: '1' } },
  // TODO: sig-val, needs s/r-value
  // TODO: desc:sig-envelope, needs sig-value, any
  // { syrup: '<17\'desc:sig-envelope123+>', value: { type: 'desc:sig-envelope', object: { type: 'desc:handoff-give', receiverKey: { type: 'public-key', scheme: 'ed25519', curve: 'ed25519', flags: 'ed25519', q: new Uint8Array(32) }, exporterLocation: { type: 'ocapn-node', transport: 'tcp', address: '127.0.0.1', hints: false }, session: new Uint8Array(32), gifterSide: { type: 'public-key', scheme: 'ed25519', curve: 'ed25519', flags: 'ed25519', q: new Uint8Array(32) }, giftId: new Uint8Array(32) }, signature: new Uint8Array(32) } },
  { syrup: `<18'desc:import-object123+>`, value: { type: 'desc:import-object', position: 123n } },
  { syrup: `<19'desc:import-promise456+>`, value: { type: 'desc:import-promise', position: 456n } },
  { syrup: `<11'desc:export123+>`, value: { type: 'desc:export', position: 123n } },
  { syrup: `<11'desc:answer456+>`, value: { type: 'desc:answer', position: 456n } },
  { syrup: `<${sym('desc:handoff-give')}${makePubKey('ecc', 'Ed25519', 'eddsa', '1')}${makeNode('tcp', '127.0.0.1', false)}${bts('123')}${makePubKey('ecc', 'Ed25519', 'eddsa', '2')}${bts('456')}>`, value: { type: 'desc:handoff-give', receiverKey: { type: 'public-key', scheme: 'ecc', curve: 'Ed25519', flags: 'eddsa', q: '1' }, exporterLocation: { type: 'ocapn-node', transport: 'tcp', address: '127.0.0.1', hints: false }, session: '123', gifterSide: { type: 'public-key', scheme: 'ecc', curve: 'Ed25519', flags: 'eddsa', q: '2' }, giftId: '456' } },
  // TODO: desc:handoff-receive, needs desc:sig-envelope
  // { syrup: `<${sym('desc:handoff-receive')}${bts('123')}${bts('456')}${int(1)}${makeSig()}>`, value: { type: 'desc:handoff-receive', receivingSession: '123', receivingSide: '456' } },
];

export const operationsTable = [
  { syrup: '<8\'op:abort7"explode>', value: { type: 'op:abort', reason: 'explode' } },
];
