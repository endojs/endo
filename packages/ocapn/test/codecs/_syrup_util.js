// @ts-check

const textEncoder = new TextEncoder();

/**
 * @param {string} string
 * @returns {Uint8Array}
 */
export const strToUint8Array = string => {
  return new Uint8Array(string.split('').map(c => c.charCodeAt(0)));
};

/**
 * Converts a hex string to a Uint8Array
 * @param {string} hexString - The hex string to convert
 * @returns {Uint8Array} The Uint8Array representation of the hex string
 */
export function hexToUint8Array(hexString) {
  if (hexString.length % 2 !== 0) {
    throw new Error(
      `Hex string must have an even length, got ${hexString.length}`,
    );
  }
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
  }
  return bytes;
}

export const exampleSigParamBytes = Uint8Array.from(
  { length: 32 },
  (_, i) => i,
);
export const examplePubKeyQBytes = Uint8Array.from(
  { length: 32 },
  (_, i) => i * 2,
);

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
 * @param {Uint8Array} u
 * @returns {string}
 */
export const bts = u => {
  if (!(u instanceof Uint8Array)) {
    throw Error(`Expected Uint8Array, got ${typeof u}`);
  }
  return `${u.length}:${String.fromCharCode(...u)}`;
};

/**
 * @param {string} u
 * @returns {string}
 */
export const btsStr = u => {
  if (typeof u !== 'string') {
    throw Error(`Expected string, got ${typeof u}`);
  }
  const bytes = textEncoder.encode(u);
  return bts(bytes);
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
 * @param {string} label
 * @param {Array<string>} items
 * @returns {string}
 */
export const record = (label, ...items) => `<${sel(label)}${items.join('')}>`;

/**
 * @param {string} transport
 * @param {string} address
 * @param {boolean} hints
 * @returns {string}
 */
export const makeNode = (transport, address, hints) => {
  return record('ocapn-node', sel(transport), str(address), bool(hints));
};

/**
 * @param {Uint8Array} q
 * @returns {string}
 */
export const makePubKey = q => {
  return list([
    sel('public-key'),
    list([
      sel('ecc'),
      list([sel('curve'), sel('Ed25519')]),
      list([sel('flags'), sel('eddsa')]),
      list([sel('q'), bts(q)]),
    ]),
  ]);
};

/**
 * @param {string} label
 * @param {Uint8Array} value
 * @returns {string}
 */
export const makeSigComp = (label, value) => {
  return list([sel(label), bts(value)]);
};

/**
 * @param {Uint8Array} r
 * @param {Uint8Array} s
 * @param {string} [scheme]
 * @returns {string}
 */
export const makeSig = (r, s, scheme = 'eddsa') => {
  if (r.length !== 32) {
    throw Error(`Expected r to be 32 bytes, got ${r.length}`);
  }
  if (s.length !== 32) {
    throw Error(`Expected s to be 32 bytes, got ${s.length}`);
  }
  return list([
    sel('sig-val'),
    list([sel(scheme), makeSigComp('r', r), makeSigComp('s', s)]),
  ]);
};

/**
 * @param {number} position
 * @returns {string}
 */
export const makeExport = position => {
  return record('desc:export', int(position));
};

/**
 * @param {number} position
 * @returns {string}
 */
export const makeImportObject = position => {
  return record('desc:import-object', int(position));
};

/**
 * @param {number} position
 * @returns {string}
 */
export const makeImportPromise = position => {
  return record('desc:import-promise', int(position));
};

/**
 * @param {string} object
 * @param {string} signature
 * @returns {string}
 */
export const makeSigEnvelope = (object, signature) => {
  return record('desc:sig-envelope', object, signature);
};

/**
 * @param {string} receiverKey
 * @param {string} exporterLocation
 * @param {Uint8Array} exporterSessionId
 * @param {Uint8Array} gifterSideId
 * @param {Uint8Array} giftId
 * @returns {string}
 */
export const makeDescGive = (
  receiverKey,
  exporterLocation,
  exporterSessionId,
  gifterSideId,
  giftId,
) => {
  return record(
    'desc:handoff-give',
    receiverKey,
    exporterLocation,
    bts(exporterSessionId),
    bts(gifterSideId),
    bts(giftId),
  );
};

/**
 * @param {string} signature
 * @returns {string}
 */
export const makeSignedHandoffGive = signature => {
  const descGive = makeDescGive(
    makePubKey(examplePubKeyQBytes),
    makeNode('tcp', '127.0.0.1', false),
    strToUint8Array('exporter-session-id'),
    strToUint8Array('gifter-side-id'),
    strToUint8Array('gift-id'),
  );
  const signedGiveEnvelope = makeSigEnvelope(descGive, signature);
  return signedGiveEnvelope;
};

/**
 * @param {Uint8Array} recieverSession
 * @param {Uint8Array} recieverSide
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
  return record(
    'desc:handoff-receive',
    bts(recieverSession),
    bts(recieverSide),
    int(handoffCount),
    signedGiveEnvelope,
  );
};

/**
 * @returns {string}
 */
export const makeSignedHandoffReceive = () => {
  const handoffReceive = makeHandoffReceive(
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
  );
  const signature = makeSig(exampleSigParamBytes, exampleSigParamBytes);
  const signedHandoffReceive = makeSigEnvelope(handoffReceive, signature);
  return signedHandoffReceive;
};
