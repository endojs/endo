// @ts-check

/**
 * Minimal CBOR codec for the engo envelope protocol.
 *
 * Envelopes are 4-element CBOR arrays: [handle, verb, payload, nonce].
 * Frames are CBOR byte strings wrapping encoded envelopes.
 *
 * This codec is intentionally minimal — it only handles the types used
 * by the envelope protocol (unsigned/negative integers, byte strings,
 * text strings, arrays, maps) and does not attempt to be a general-purpose
 * CBOR library.
 */

// CBOR major types
const CBOR_UINT = 0;
const CBOR_NEGINT = 1;
const CBOR_BYTES = 2;
const CBOR_TEXT = 3;
const CBOR_ARRAY = 4;
// const CBOR_MAP = 5;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// ---------------------------------------------------------------------------
// CBOR encoding
// ---------------------------------------------------------------------------

/**
 * Append a CBOR head (major type + argument) to a byte list.
 * @param {number[]} buf - mutable byte array
 * @param {number} major - major type (0-7)
 * @param {number} n - argument value
 */
const cborAppendHead = (buf, major, n) => {
  const m = major << 5;
  if (n < 24) {
    buf.push(m | n);
  } else if (n <= 0xff) {
    buf.push(m | 24, n);
  } else if (n <= 0xffff) {
    buf.push(m | 25, (n >> 8) & 0xff, n & 0xff);
  } else if (n <= 0xffffffff) {
    buf.push(
      m | 26,
      (n >> 24) & 0xff,
      (n >> 16) & 0xff,
      (n >> 8) & 0xff,
      n & 0xff,
    );
  } else {
    // For values > 32 bits, we'd need BigInt. Handle sizes are small.
    throw new Error(`CBOR value too large: ${n}`);
  }
};

/**
 * Encode an integer (signed).
 * @param {number[]} buf
 * @param {number} n
 */
const cborAppendInt = (buf, n) => {
  if (n >= 0) {
    cborAppendHead(buf, CBOR_UINT, n);
  } else {
    cborAppendHead(buf, CBOR_NEGINT, -1 - n);
  }
};

/**
 * Encode a byte string.
 * @param {number[]} buf
 * @param {Uint8Array} data
 */
const cborAppendBytes = (buf, data) => {
  cborAppendHead(buf, CBOR_BYTES, data.length);
  for (let i = 0; i < data.length; i += 1) {
    buf.push(data[i]);
  }
};

/**
 * Encode a text string.
 * @param {number[]} buf
 * @param {string} s
 */
const cborAppendText = (buf, s) => {
  const encoded = textEncoder.encode(s);
  cborAppendHead(buf, CBOR_TEXT, encoded.length);
  for (let i = 0; i < encoded.length; i += 1) {
    buf.push(encoded[i]);
  }
};

/**
 * @typedef {object} Envelope
 * @property {number} handle
 * @property {string} verb
 * @property {Uint8Array} payload
 * @property {number} nonce
 */

/**
 * Encode an envelope as a CBOR 4-element array.
 * @param {Envelope} env
 * @returns {Uint8Array}
 */
export const encodeEnvelope = env => {
  /** @type {number[]} */
  const buf = [];
  cborAppendHead(buf, CBOR_ARRAY, 4);
  cborAppendInt(buf, env.handle);
  cborAppendText(buf, env.verb);
  cborAppendBytes(buf, env.payload || new Uint8Array(0));
  cborAppendInt(buf, env.nonce || 0);
  return new Uint8Array(buf);
};
harden(encodeEnvelope);

/**
 * Encode a CBOR frame: a byte string wrapping the given data.
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export const encodeFrame = data => {
  /** @type {number[]} */
  const buf = [];
  cborAppendBytes(buf, data);
  return new Uint8Array(buf);
};
harden(encodeFrame);

// ---------------------------------------------------------------------------
// CBOR decoding
// ---------------------------------------------------------------------------

/**
 * A simple cursor for reading CBOR from a Uint8Array.
 * @param {Uint8Array} data
 * @returns {{ pos: number, data: Uint8Array }}
 */
const makeCursor = data => ({ pos: 0, data });

/**
 * Read a CBOR head from the cursor.
 * @param {{ pos: number, data: Uint8Array }} cursor
 * @returns {{ major: number, value: number }}
 */
const cborReadHead = cursor => {
  if (cursor.pos >= cursor.data.length) {
    throw new Error('CBOR: unexpected end of input');
  }
  const initial = cursor.data[cursor.pos];
  cursor.pos += 1;
  const major = initial >> 5;
  const info = initial & 0x1f;
  if (info < 24) {
    return { major, value: info };
  }
  let size;
  if (info === 24) size = 1;
  else if (info === 25) size = 2;
  else if (info === 26) size = 4;
  else if (info === 27) size = 8;
  else throw new Error(`CBOR: unsupported additional info ${info}`);
  let value = 0;
  for (let i = 0; i < size; i += 1) {
    value = value * 256 + cursor.data[cursor.pos + i];
  }
  cursor.pos += size;
  return { major, value };
};

/**
 * Read a CBOR integer (signed).
 * @param {{ pos: number, data: Uint8Array }} cursor
 * @returns {number}
 */
const cborReadInt = cursor => {
  const { major, value } = cborReadHead(cursor);
  if (major === CBOR_UINT) return value;
  if (major === CBOR_NEGINT) return -1 - value;
  throw new Error(`CBOR: expected int, got major ${major}`);
};

/**
 * Read a CBOR byte string.
 * @param {{ pos: number, data: Uint8Array }} cursor
 * @returns {Uint8Array}
 */
const cborReadBytes = cursor => {
  const { major, value } = cborReadHead(cursor);
  if (major !== CBOR_BYTES) {
    throw new Error(`CBOR: expected bytes (major 2), got major ${major}`);
  }
  const result = cursor.data.subarray(cursor.pos, cursor.pos + value);
  cursor.pos += value;
  return new Uint8Array(result);
};

/**
 * Read a CBOR text string.
 * @param {{ pos: number, data: Uint8Array }} cursor
 * @returns {string}
 */
const cborReadText = cursor => {
  const { major, value } = cborReadHead(cursor);
  if (major !== CBOR_TEXT) {
    throw new Error(`CBOR: expected text (major 3), got major ${major}`);
  }
  const result = textDecoder.decode(
    cursor.data.subarray(cursor.pos, cursor.pos + value),
  );
  cursor.pos += value;
  return result;
};

/**
 * Read a CBOR array header.
 * @param {{ pos: number, data: Uint8Array }} cursor
 * @returns {number} - number of elements
 */
const cborReadArrayHeader = cursor => {
  const { major, value } = cborReadHead(cursor);
  if (major !== CBOR_ARRAY) {
    throw new Error(`CBOR: expected array (major 4), got major ${major}`);
  }
  return value;
};

/**
 * Decode a CBOR frame (byte string) from raw bytes.
 * @param {Uint8Array} frameData
 * @returns {Uint8Array} - the inner content
 */
export const decodeFrame = frameData => {
  const cursor = makeCursor(frameData);
  return cborReadBytes(cursor);
};
harden(decodeFrame);

/**
 * Decode an envelope from a CBOR 4-element array.
 * @param {Uint8Array} data
 * @returns {Envelope}
 */
export const decodeEnvelope = data => {
  const cursor = makeCursor(data);
  const n = cborReadArrayHeader(cursor);
  if (n !== 3 && n !== 4) {
    throw new Error(`Envelope: expected 3 or 4 elements, got ${n}`);
  }
  const handle = cborReadInt(cursor);
  const verb = cborReadText(cursor);
  const payload = cborReadBytes(cursor);
  const nonce = n === 4 ? cborReadInt(cursor) : 0;
  return harden({ handle, verb, payload, nonce });
};
harden(decodeEnvelope);

// ---------------------------------------------------------------------------
// Streaming: read CBOR frames from a Node.js readable stream
// ---------------------------------------------------------------------------

/**
 * Read exactly `n` bytes from a Node.js readable stream.
 * @param {import('stream').Readable} stream
 * @param {number} n
 * @returns {Promise<Uint8Array | null>}
 */
const readExactly = (stream, n) => {
  return new Promise((resolve, reject) => {
    const chunks = /** @type {Buffer[]} */ ([]);
    let remaining = n;

    const onReadable = () => {
      while (remaining > 0) {
        const chunk = stream.read(Math.min(remaining, stream.readableLength));
        if (chunk === null) {
          return; // Wait for more data
        }
        chunks.push(chunk);
        remaining -= chunk.length;
      }
      cleanup();
      resolve(new Uint8Array(Buffer.concat(chunks)));
    };

    const onEnd = () => {
      cleanup();
      if (remaining === n) {
        resolve(null); // Clean EOF
      } else {
        reject(new Error('CBOR: unexpected EOF in frame'));
      }
    };

    const onError = (/** @type {Error} */ err) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      stream.removeListener('readable', onReadable);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
    };

    stream.on('readable', onReadable);
    stream.on('end', onEnd);
    stream.on('error', onError);

    // Try reading immediately in case data is already buffered.
    onReadable();
  });
};

/**
 * Read one CBOR byte-string frame from a Node.js readable stream.
 * Returns the inner content bytes, or null on EOF.
 * @param {import('stream').Readable} stream
 * @returns {Promise<Uint8Array | null>}
 */
export const readFrameFromStream = async stream => {
  // Read the CBOR byte-string header.
  const firstByte = await readExactly(stream, 1);
  if (firstByte === null) return null;

  const major = firstByte[0] >> 5;
  if (major !== CBOR_BYTES) {
    throw new Error(
      `CBOR frame: expected byte string (major 2), got major ${major}`,
    );
  }
  const info = firstByte[0] & 0x1f;

  let length;
  if (info < 24) {
    length = info;
  } else if (info === 24) {
    const b = await readExactly(stream, 1);
    if (b === null) throw new Error('CBOR: unexpected EOF in frame header');
    length = b[0];
  } else if (info === 25) {
    const b = await readExactly(stream, 2);
    if (b === null) throw new Error('CBOR: unexpected EOF in frame header');
    length = (b[0] << 8) | b[1];
  } else if (info === 26) {
    const b = await readExactly(stream, 4);
    if (b === null) throw new Error('CBOR: unexpected EOF in frame header');
    length = (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3];
  } else {
    throw new Error(`CBOR frame: unsupported length info ${info}`);
  }

  if (length === 0) return new Uint8Array(0);

  const content = await readExactly(stream, length);
  if (content === null) {
    throw new Error('CBOR: unexpected EOF in frame content');
  }
  return content;
};
harden(readFrameFromStream);

/**
 * Write a CBOR byte-string frame to a Node.js writable stream.
 * @param {import('stream').Writable} stream
 * @param {Uint8Array} data
 * @returns {Promise<void>}
 */
export const writeFrameToStream = (stream, data) => {
  const frame = encodeFrame(data);
  return new Promise((resolve, reject) => {
    stream.write(frame, err => {
      if (err) reject(err);
      else resolve(undefined);
    });
  });
};
harden(writeFrameToStream);
