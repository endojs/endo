// @ts-check

import harden from '@endo/harden';

// Syrup grammar: <length> ":" <payload> (no trailing separator).
// Derived from @endo/netstring; the only behavioral difference is that
// there is no COMMA check after the payload.  See
// designs/ocapn-tcp-syrup-framing.md.

const COLON = ':'.charCodeAt(0);
const ZERO = '0'.charCodeAt(0);
const NINE = '9'.charCodeAt(0);

/**
 * @param {Iterable<Uint8Array> | AsyncIterable<Uint8Array>} input
 * @param {object} opts
 * @param {string} [opts.name]
 * @param {number} [opts.maxMessageLength]
 */
async function* makeSyrupIterator(
  input,
  { name = '<unknown>', maxMessageLength = 999_999_999 } = {},
) {
  // eslint-disable-next-line no-bitwise
  const maxPrefixLength = `${maxMessageLength | 0}:`.length;

  // byte offset of data consumed so far in the input stream
  let offset = 0;

  // The iterator can be in 2 states: waiting for the length, or waiting
  // for the data.
  // - When waiting for the length, the lengthBuffer is an array of digit
  //   charCodes for the length prefix.
  // - When waiting for the data, the dataBuffer is either:
  //   - null, to indicate no data has been received yet, or
  //   - a newly allocated buffer large enough for the whole payload.
  //   In either case, remainingDataLength contains how many bytes are
  //   still needed.  If the whole payload is received in one chunk, no
  //   copy is made.
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
            if (lengthBuffer.length === maxPrefixLength) {
              throw Error(
                `Too long syrup length prefix ${JSON.stringify(
                  String.fromCharCode(...lengthBuffer),
                )}... at offset ${offset} of ${name}`,
              );
            }
          } else if (c === COLON && lengthBuffer.length) {
            lengthBuffer.push(c);
            break;
          } else {
            throw Error(
              `Invalid syrup length prefix ${JSON.stringify(
                String.fromCharCode(...lengthBuffer, c),
              )} at offset ${offset} of ${name}`,
            );
          }
        }

        buffer = buffer.subarray(i);

        if (lengthBuffer[lengthBuffer.length - 1] === COLON) {
          lengthBuffer.pop();
          // The prefix is composed only of ASCII digits (the inner
          // loop pushes on `c >= ZERO && c <= NINE` and rejects
          // everything else), so `+prefix` is always a finite,
          // non-negative integer.  No NaN guard needed.
          const prefix = String.fromCharCode(...lengthBuffer);
          remainingDataLength = +prefix;
          if (remainingDataLength > maxMessageLength) {
            throw Error(
              `Syrup message too big (length ${remainingDataLength}) at offset ${offset} of ${name}`,
            );
          }
          offset += lengthBuffer.length + 1;
          lengthBuffer = null;
        }
      }

      // Waiting for data.  The payload is exactly `remainingDataLength`
      // bytes with no trailing separator.  This is the one behavioral
      // departure from @endo/netstring.
      if (!lengthBuffer) {
        if (buffer.length >= remainingDataLength) {
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
          buffer = buffer.subarray(remainingDataLength);
          remainingDataLength = -1;
          lengthBuffer = [];
          yield data;
        } else if (buffer.length) {
          // The outer `>=` guard is false here, so buffer.length is
          // strictly less than remainingDataLength.  Allocate or
          // grow into a payload buffer and copy the partial chunk.
          dataBuffer = dataBuffer || new Uint8Array(remainingDataLength);
          dataBuffer.set(buffer, dataBuffer.length - remainingDataLength);
          remainingDataLength -= buffer.length;
          buffer = buffer.subarray(buffer.length);
        }
      }
    }
  }

  if (!lengthBuffer) {
    throw Error(`Unexpected dangling message at offset ${offset} of ${name}`);
  }

  return undefined;
}
harden(makeSyrupIterator);

/**
 * @param {Iterable<Uint8Array> | AsyncIterable<Uint8Array>} input
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @param {number} [opts.maxMessageLength]
 * @returns {import('@endo/stream').Reader<Uint8Array, undefined>} input
 */
export const makeSyrupReader = (input, opts) => {
  return harden(makeSyrupIterator(input, opts));
};
harden(makeSyrupReader);
