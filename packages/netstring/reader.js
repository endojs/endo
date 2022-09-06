// @ts-check
/// <reference types="ses"/>

const COLON = ':'.charCodeAt(0);
const COMMA = ','.charCodeAt(0);
const ZERO = '0'.charCodeAt(0);
const NINE = '9'.charCodeAt(0);

/**
 * @param {Iterable<Uint8Array> | AsyncIterable<Uint8Array>} input
 * @param {Object} [opts]
 * @param {string} [opts.name]
 */
async function* makeNetstringIterator(input, { name = '<unknown>' } = {}) {
  // byte offset of data consumed so far in the input stream
  let offset = 0;

  // The iterator can be in 2 states: waiting for the length, or waiting for the data
  // - When waiting for the length, the lengthBuffer is an array containing
  //   digits charCodes for the length prefix
  // - When waiting for the data, the dataBuffer is either:
  //   - null to indicate no data has been received yet.
  //   - A newly allocated buffer large enough to accommodate the whole expected data.
  //   In either case, remainingDataLength contains the length of the data to read.
  //   If the whole data is received in one chunk, no copy is made.
  /** @type {number[] | null} */
  let lengthBuffer = [];
  /** @type {Uint8Array | null} */
  let dataBuffer = null;
  let remainingDataLength = -1;

  for await (const chunk of input) {
    let buffer = chunk;

    while (buffer.length) {
      // Waiting for full length prefix
      if (lengthBuffer) {
        let i = 0;
        while (i < buffer.length) {
          const c = buffer[i];
          i += 1;
          if (c >= ZERO && c <= NINE) {
            lengthBuffer.push(c);
          } else if (c === COLON && lengthBuffer.length) {
            lengthBuffer.push(c);
            break;
          } else {
            throw new Error(
              `Invalid netstring length prefix ${JSON.stringify(
                String.fromCharCode(...lengthBuffer, c),
              )} at offset ${offset} of ${name}`,
            );
          }
        }

        buffer = buffer.subarray(i);

        if (lengthBuffer[lengthBuffer.length - 1] === COLON) {
          lengthBuffer.pop();
          const prefix = String.fromCharCode(...lengthBuffer);
          remainingDataLength = +prefix;
          if (Number.isNaN(remainingDataLength)) {
            throw new Error(
              `Invalid netstring prefix length ${prefix} at offset ${offset} of ${name}`,
            );
          }
          offset += lengthBuffer.length + 1;
          lengthBuffer = null;
        }
      }

      // Waiting for data
      if (!lengthBuffer) {
        if (buffer.length > remainingDataLength) {
          const remainingData = buffer.subarray(0, remainingDataLength);
          const data = dataBuffer
            ? (dataBuffer.set(
                remainingData,
                dataBuffer.length - remainingDataLength,
              ),
              dataBuffer)
            : remainingData;
          dataBuffer = null;
          offset += data.length;
          if (buffer[remainingDataLength] !== COMMA) {
            throw new Error(
              `Invalid netstring separator "${String.fromCharCode(
                buffer[remainingDataLength],
              )} at offset ${offset} of ${name}`,
            );
          }
          offset += 1;
          buffer = buffer.subarray(remainingDataLength + 1);
          remainingDataLength = -1;
          lengthBuffer = [];
          yield data;
        } else if (buffer.length) {
          dataBuffer = dataBuffer || new Uint8Array(remainingDataLength);
          dataBuffer.set(buffer, dataBuffer.length - remainingDataLength);
          remainingDataLength -= buffer.length;
          buffer = buffer.subarray(buffer.length);
        }
      }
    }
  }

  if (!lengthBuffer) {
    throw new Error(
      `Unexpected dangling message at offset ${offset} of ${name}`,
    );
  }

  return undefined;
}

/**
 * @param {Iterable<Uint8Array> | AsyncIterable<Uint8Array>} input
 * @param {Object} [opts]
 * @param {string} [opts.name]
 * @returns {import('@endo/stream').Reader<Uint8Array, undefined>} input
 */
export const makeNetstringReader = (input, opts) => {
  return harden(makeNetstringIterator(input, opts));
};
harden(makeNetstringReader);

// Legacy
/**
 * @param {Iterable<Uint8Array> | AsyncIterable<Uint8Array>} input
 * @param {string=} name
 * @param {number=} _capacity
 * @returns {import('@endo/stream').Stream<Uint8Array, undefined>} input
 */
export const netstringReader = (input, name, _capacity) => {
  return harden(
    makeNetstringIterator(input, {
      name,
    }),
  );
};
