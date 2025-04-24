const textEncoder = new TextEncoder();

/**
 * @param {string} s
 * @returns {string}
 */
export const sel = s => {
  const b = textEncoder.encode(s);
  return `${b.length}'${String.fromCharCode(...b)}`;
};

/**
 * @param {string} s
 * @returns {string}
 */
export const str = s => {
  const b = textEncoder.encode(s);
  return `${b.length}"${String.fromCharCode(...b)}`;
};

/**
 * @param {string} s
 * @returns {string}
 */
export const bts = s => {
  const b = textEncoder.encode(s);
  return `${b.length}:${String.fromCharCode(...b)}`;
};

/**
 * @param {boolean} b
 * @returns {string}
 */
export const bool = b => (b ? 't' : 'f');

/**
 * @param {number} i
 * @returns {string}
 */
export const int = i => `${Math.floor(Math.abs(i))}${i < 0 ? '-' : '+'}`;

/**
 * @param {Array<string>} items
 * @returns {string}
 */
export const list = items => `[${items.join('')}]`;

/**
 * @param {string} transport
 * @param {string} address
 * @param {boolean} hints
 * @returns {string}
 */
export const makeNode = (transport, address, hints) => {
  return `<${sel('ocapn-node')}${sel(transport)}${bts(address)}${bool(hints)}>`;
};

/**
 * @param {string} scheme
 * @param {string} curve
 * @param {string} flags
 * @param {string} q
 * @returns {string}
 */
export const makePubKey = (scheme, curve, flags, q) => {
  return `<${sel('public-key')}${sel(scheme)}${sel(curve)}${sel(flags)}${bts(q)}>`;
};

/**
 * @param {string} label
 * @param {string} value
 * @returns {string}
 */
export const makeSigComp = (label, value) => {
  return `${sel(label)}${bts(value)}`;
};

/**
 * @param {string} scheme
 * @param {string} r
 * @param {string} s
 * @returns {string}
 */
export const makeSig = (scheme, r, s) => {
  return `<${sel('sig-val')}${sel(scheme)}${makeSigComp('r', r)}${makeSigComp('s', s)}>`;
};

/**
 * @param {number} position
 * @returns {string}
 */
export const makeExport = position => {
  return `<${sel('desc:export')}${int(position)}>`;
};

/**
 * @param {number} position
 * @returns {string}
 */
export const makeImportObject = position => {
  return `<${sel('desc:import-object')}${int(position)}>`;
};

/**
 * @param {number} position
 * @returns {string}
 */
export const makeImportPromise = position => {
  return `<${sel('desc:import-promise')}${int(position)}>`;
};

/**
 * @param {string} receiverKey
 * @param {string} exporterLocation
 * @param {string} session
 * @param {string} gifterSide
 * @param {string} giftId
 * @returns {string}
 */
export const makeDescGive = (
  receiverKey,
  exporterLocation,
  session,
  gifterSide,
  giftId,
) => {
  return `<${sel('desc:handoff-give')}${receiverKey}${exporterLocation}${bts(session)}${gifterSide}${bts(giftId)}>`;
};

/**
 * @param {string} object
 * @param {string} signature
 * @returns {string}
 */
export const makeSigEnvelope = (object, signature) => {
  return `<${sel('desc:sig-envelope')}${object}${signature}>`;
};

/**
 * @param {string} recieverSession
 * @param {string} recieverSide
 * @param {number} handoffCount
 * @param {string} descGive
 * @param {string} signature
 * @returns {string}
 */
export const makeHandoffReceive = (
  recieverSession,
  recieverSide,
  handoffCount,
  descGive,
  signature,
) => {
  const signedGiveEnvelope = makeSigEnvelope(descGive, signature);
  return `<${sel('desc:handoff-receive')}${bts(recieverSession)}${bts(recieverSide)}${int(handoffCount)}${signedGiveEnvelope}>`;
};

/**
 * @param {string} string
 * @returns {Uint8Array}
 */
export const strToUint8Array = string => {
  return new Uint8Array(string.split('').map(c => c.charCodeAt(0)));
};
