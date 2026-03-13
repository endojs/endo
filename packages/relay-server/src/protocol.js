// @ts-check

// Wire protocol frame encode/decode for the Endo relay.
// This module is intentionally free of Node-specific APIs and SES
// dependencies so it can be imported from both the standalone relay
// server and the SES-locked daemon caplet.

// --- Message types ---

// Phase 1: Authentication
export const MSG_HELLO = 0x01;
export const MSG_CHALLENGE = 0x02;
export const MSG_RESPONSE = 0x03;
export const MSG_AUTH_OK = 0x04;
export const MSG_AUTH_FAIL = 0x05;

// Phase 2: Multiplexed channels
export const MSG_OPEN = 0x10;
export const MSG_INCOMING = 0x11;
export const MSG_OPENED = 0x12;
export const MSG_OPEN_FAILED = 0x13;
export const MSG_DATA = 0x14;
export const MSG_CLOSE = 0x15;
export const MSG_PEER_GONE = 0x16;

// --- Hex utilities ---

/** @param {Uint8Array} bytes */
export const toHex = bytes =>
  Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

/** @param {string} hex */
export const fromHex = hex => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

// --- Low-level frame encoding ---

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * @param {number} type - single-byte message type
 * @param {Uint8Array} [payload]
 * @returns {Uint8Array}
 */
export const encodeFrame = (type, payload = new Uint8Array(0)) => {
  const frame = new Uint8Array(1 + payload.length);
  frame[0] = type;
  frame.set(payload, 1);
  return frame;
};

/**
 * @param {Uint8Array | ArrayBuffer} data
 * @returns {{ type: number, payload: Uint8Array }}
 */
export const decodeFrame = data => {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 1) {
    throw new Error('Empty frame');
  }
  return { type: bytes[0], payload: bytes.subarray(1) };
};

// --- Channel ID helpers (4 bytes, big-endian) ---

/** @param {number} channelId */
export const encodeChannelId = channelId => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, channelId, false);
  return bytes;
};

/**
 * @param {Uint8Array} bytes
 * @param {number} [offset]
 */
export const decodeChannelId = (bytes, offset = 0) =>
  new DataView(bytes.buffer, bytes.byteOffset + offset).getUint32(0, false);

// --- Phase 1 encoders ---

/** @param {Uint8Array} nodeId - 32-byte Ed25519 public key */
export const encodeHello = nodeId => encodeFrame(MSG_HELLO, nodeId);

/** @param {Uint8Array} nonce - 32-byte random nonce */
export const encodeChallenge = nonce => encodeFrame(MSG_CHALLENGE, nonce);

/** @param {Uint8Array} signature - 64-byte Ed25519 signature */
export const encodeResponse = signature => encodeFrame(MSG_RESPONSE, signature);

export const encodeAuthOk = () => encodeFrame(MSG_AUTH_OK);

/** @param {string} reason */
export const encodeAuthFail = reason =>
  encodeFrame(MSG_AUTH_FAIL, textEncoder.encode(reason));

// --- Phase 2 encoders ---

/**
 * @param {number} channelId
 * @param {Uint8Array} targetNodeId - 32-byte Ed25519 public key
 */
export const encodeOpen = (channelId, targetNodeId) => {
  const payload = new Uint8Array(4 + 32);
  payload.set(encodeChannelId(channelId), 0);
  payload.set(targetNodeId, 4);
  return encodeFrame(MSG_OPEN, payload);
};

/**
 * @param {number} channelId
 * @param {Uint8Array} fromNodeId
 */
export const encodeIncoming = (channelId, fromNodeId) => {
  const payload = new Uint8Array(4 + 32);
  payload.set(encodeChannelId(channelId), 0);
  payload.set(fromNodeId, 4);
  return encodeFrame(MSG_INCOMING, payload);
};

/** @param {number} channelId */
export const encodeOpened = channelId =>
  encodeFrame(MSG_OPENED, encodeChannelId(channelId));

/**
 * @param {number} channelId
 * @param {string} reason
 */
export const encodeOpenFailed = (channelId, reason) => {
  const reasonBytes = textEncoder.encode(reason);
  const payload = new Uint8Array(4 + reasonBytes.length);
  payload.set(encodeChannelId(channelId), 0);
  payload.set(reasonBytes, 4);
  return encodeFrame(MSG_OPEN_FAILED, payload);
};

/**
 * @param {number} channelId
 * @param {Uint8Array} data
 */
export const encodeData = (channelId, data) => {
  const payload = new Uint8Array(4 + data.length);
  payload.set(encodeChannelId(channelId), 0);
  payload.set(data, 4);
  return encodeFrame(MSG_DATA, payload);
};

/** @param {number} channelId */
export const encodeClose = channelId =>
  encodeFrame(MSG_CLOSE, encodeChannelId(channelId));

/** @param {number} channelId */
export const encodePeerGone = channelId =>
  encodeFrame(MSG_PEER_GONE, encodeChannelId(channelId));

// --- Decoders ---

/** @param {Uint8Array} payload */
export const decodeHello = payload => ({ nodeId: payload.subarray(0, 32) });

/** @param {Uint8Array} payload */
export const decodeChallenge = payload => ({
  nonce: payload.subarray(0, 32),
});

/** @param {Uint8Array} payload */
export const decodeResponse = payload => ({
  signature: payload.subarray(0, 64),
});

/** @param {Uint8Array} payload */
export const decodeAuthFail = payload => ({
  reason: textDecoder.decode(payload),
});

/** @param {Uint8Array} payload */
export const decodeOpen = payload => ({
  channelId: decodeChannelId(payload, 0),
  targetNodeId: payload.subarray(4, 36),
});

/** @param {Uint8Array} payload */
export const decodeIncoming = payload => ({
  channelId: decodeChannelId(payload, 0),
  fromNodeId: payload.subarray(4, 36),
});

/** @param {Uint8Array} payload */
export const decodeOpened = payload => ({
  channelId: decodeChannelId(payload, 0),
});

/** @param {Uint8Array} payload */
export const decodeOpenFailed = payload => ({
  channelId: decodeChannelId(payload, 0),
  reason: textDecoder.decode(payload.subarray(4)),
});

/** @param {Uint8Array} payload */
export const decodeDataFrame = payload => ({
  channelId: decodeChannelId(payload, 0),
  data: payload.subarray(4),
});

/** @param {Uint8Array} payload */
export const decodeClose = payload => ({
  channelId: decodeChannelId(payload, 0),
});

/** @param {Uint8Array} payload */
export const decodePeerGone = payload => ({
  channelId: decodeChannelId(payload, 0),
});
