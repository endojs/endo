export const sym = s => `${s.length}'${s}`;
export const str = s => `${s.length}"${s}`;
export const bts = s => `${s.length}:${s}`;
export const bool = b => (b ? 't' : 'f');
// eslint-disable-next-line @endo/restrict-comparison-operands
export const int = i => `${Math.floor(Math.abs(i))}${i < 0 ? '-' : '+'}`;
export const list = items => `[${items.join('')}]`;
export const makeNode = (transport, address, hints) => {
  return `<10'ocapn-node${sym(transport)}${bts(address)}${bool(hints)}>`;
};

export const makePubKey = (scheme, curve, flags, q) => {
  return `<${sym('public-key')}${sym(scheme)}${sym(curve)}${sym(flags)}${bts(q)}>`;
};

export const makeSigComp = (label, value) => {
  return `${sym(label)}${bts(value)}`;
};

export const makeSig = (scheme, r, s) => {
  return `<${sym('sig-val')}${sym(scheme)}${makeSigComp('r', r)}${makeSigComp('s', s)}>`;
};

export const makeExport = position => {
  return `<${sym('desc:export')}${int(position)}>`;
};

export const makeImportObj = position => {
  return `<${sym('desc:import-object')}${int(position)}>`;
};

export const makeImportPromise = position => {
  return `<${sym('desc:import-promise')}${int(position)}>`;
};

export const makeDescGive = (
  receiverKey,
  exporterLocation,
  session,
  gifterSide,
  giftId,
) => {
  return `<${sym('desc:handoff-give')}${receiverKey}${exporterLocation}${bts(session)}${gifterSide}${bts(giftId)}>`;
};

export const makeSigEnvelope = (object, signature) => {
  return `<${sym('desc:sig-envelope')}${object}${signature}>`;
};

export const makeHandoffReceive = (
  recieverSession,
  recieverSide,
  handoffCount,
  descGive,
  signature,
) => {
  const signedGiveEnvelope = makeSigEnvelope(descGive, signature);
  return `<${sym('desc:handoff-receive')}${bts(recieverSession)}${bts(recieverSide)}${int(handoffCount)}${signedGiveEnvelope}>`;
};

export const strToUint8Array = string => {
  return new Uint8Array(string.split('').map(c => c.charCodeAt(0)));
};
