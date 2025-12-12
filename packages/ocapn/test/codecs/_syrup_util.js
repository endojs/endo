// @ts-check

import {
  immutableArrayBufferToUint8Array,
  uint8ArrayToImmutableArrayBuffer,
} from '../../src/buffer-utils.js';

const textEncoder = new TextEncoder();

/**
 * @param {string} string
 * @returns {ArrayBufferLike}
 */
export const strToArrayBuffer = string => {
  const uint8Array = new Uint8Array(string.split('').map(c => c.charCodeAt(0)));
  return uint8ArrayToImmutableArrayBuffer(uint8Array);
};

/**
 * Converts a hex string to an ArrayBuffer
 * @param {string} hexString - The hex string to convert
 * @returns {ArrayBufferLike} The ArrayBuffer representation of the hex string
 */
export function hexToArrayBuffer(hexString) {
  if (hexString.length % 2 !== 0) {
    throw new Error(
      `Hex string must have an even length, got ${hexString.length}`,
    );
  }
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
  }
  return uint8ArrayToImmutableArrayBuffer(bytes);
}

/**
 * @param {string} hexString
 * @returns {Uint8Array}
 */
export const hexToUint8Array = hexString => {
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
};

export const exampleSigParamBytes = uint8ArrayToImmutableArrayBuffer(
  Uint8Array.from({ length: 32 }, (_, i) => i),
);
export const examplePubKeyQBytes = uint8ArrayToImmutableArrayBuffer(
  Uint8Array.from({ length: 32 }, (_, i) => i * 2),
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
 * @param {ArrayBufferLike} buffer
 * @returns {string}
 */
export const bts = buffer => {
  // Convert ArrayBuffer to Uint8Array for string conversion
  const bytes = immutableArrayBufferToUint8Array(buffer);
  return `${bytes.length}:${String.fromCharCode(...bytes)}`;
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
  return bts(uint8ArrayToImmutableArrayBuffer(bytes));
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
 * @param {Record<string, string>} obj
 * @returns {string}
 */
export const stringStruct = obj => {
  const keys = Object.keys(obj).sort();
  const entries = keys.map(key => str(key) + str(obj[key])).join('');
  return `{${entries}}`;
};

/**
 * @param {string} transport
 * @param {string} designator
 * @param {false | Record<string, any>} hints
 * @returns {string}
 */
export const makePeer = (transport, designator, hints) => {
  // Spec/test disagreement: https://github.com/ocapn/ocapn-test-suite/issues/21
  return record(
    'ocapn-peer',
    sel(transport),
    str(designator),
    hints ? stringStruct(hints) : 'f',
  );
};

/**
 * @param {ArrayBufferLike} q
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
 * @param {ArrayBufferLike} value
 * @returns {string}
 */
export const makeSigComp = (label, value) => {
  return list([sel(label), bts(value)]);
};

/**
 * @param {ArrayBufferLike} r
 * @param {ArrayBufferLike} s
 * @param {string} [scheme]
 * @returns {string}
 */
export const makeSig = (r, s, scheme = 'eddsa') => {
  if (r.byteLength !== 32) {
    throw Error(`Expected r to be 32 bytes, got ${r.byteLength}`);
  }
  if (s.byteLength !== 32) {
    throw Error(`Expected s to be 32 bytes, got ${s.byteLength}`);
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
export const makeSigEnvelopeSyrup = (object, signature) => {
  return record('desc:sig-envelope', object, signature);
};

/**
 * @param {string} receiverKey
 * @param {string} exporterLocation
 * @param {ArrayBufferLike} exporterSessionId
 * @param {ArrayBufferLike} gifterSideId
 * @param {ArrayBufferLike} giftId
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
export const makeSignedHandoffGiveSyrup = signature => {
  const descGive = makeDescGive(
    makePubKey(examplePubKeyQBytes),
    makePeer('tcp', '1234', { host: '127.0.0.1', port: '54822' }),
    strToArrayBuffer('exporter-session-id'),
    strToArrayBuffer('gifter-side-id'),
    strToArrayBuffer('gift-id'),
  );
  const signedGiveEnvelope = makeSigEnvelopeSyrup(descGive, signature);
  return signedGiveEnvelope;
};

/**
 * @param {ArrayBufferLike} recieverSession
 * @param {ArrayBufferLike} recieverSide
 * @param {number} handoffCount
 * @param {string} descGive
 * @param {string} signature
 * @returns {string}
 */
export const makeHandoffReceiveSyrup = (
  recieverSession,
  recieverSide,
  handoffCount,
  descGive,
  signature,
) => {
  const signedGiveEnvelope = makeSigEnvelopeSyrup(descGive, signature);
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
export const makeSignedHandoffReceiveSyrup = () => {
  const handoffReceive = makeHandoffReceiveSyrup(
    strToArrayBuffer('123'),
    strToArrayBuffer('456'),
    1,
    makeDescGive(
      makePubKey(examplePubKeyQBytes),
      makePeer('tcp', '1234', { host: '127.0.0.1', port: '54822' }),
      strToArrayBuffer('exporter-session-id'),
      strToArrayBuffer('gifter-side-id'),
      strToArrayBuffer('gift-id'),
    ),
    makeSig(exampleSigParamBytes, exampleSigParamBytes),
  );
  const signature = makeSig(exampleSigParamBytes, exampleSigParamBytes);
  const signedHandoffReceive = makeSigEnvelopeSyrup(handoffReceive, signature);
  return signedHandoffReceive;
};
