// @ts-check
/// <reference types="ses"/>

const COLON = ':'.charCodeAt(0);

const decoder = new TextDecoder();

/**
 * @param {Iterable<Uint8Array> | AsyncIterable<Uint8Array>} input
 * @param {Object} [opts]
 * @param {string} [opts.name]
 * @param {number} [opts.capacity]
 */
async function* makeNetstringIterator(
  input,
  { name = '<unknown>', capacity = 1024 } = {},
) {
  let length = 0;
  let buffer = new Uint8Array(capacity);
  let offset = 0;

  for await (const chunk of input) {
    if (length + chunk.byteLength >= capacity) {
      while (length + chunk.byteLength >= capacity) {
        capacity *= 2;
      }
      const replacement = new Uint8Array(capacity);
      replacement.set(buffer, 0);
      buffer = replacement;
    }
    buffer.set(chunk, length);
    length += chunk.byteLength;

    let drained = false;
    while (!drained && length > 0) {
      const colon = buffer.indexOf(COLON);
      if (colon === 0) {
        throw new Error(
          `Expected number before colon at offset ${offset} of ${name}`,
        );
      } else if (colon > 0) {
        const prefixBytes = buffer.subarray(0, colon);
        const prefixString = decoder.decode(prefixBytes);
        const contentLength = +prefixString;
        if (Number.isNaN(contentLength)) {
          throw new Error(
            `Invalid netstring prefix length ${prefixString} at offset ${offset} of ${name}`,
          );
        }
        const messageLength = colon + contentLength + 2;
        if (messageLength <= length) {
          yield buffer.subarray(colon + 1, colon + 1 + contentLength);
          buffer.copyWithin(0, messageLength);
          length -= messageLength;
          offset += messageLength;
        } else {
          drained = true;
        }
      } else {
        drained = true;
      }
    }
  }

  if (length > 0) {
    throw new Error(
      `Unexpected dangling message at offset ${offset} of ${name}`,
    );
  }
}

/**
 * @param {Iterable<Uint8Array> | AsyncIterable<Uint8Array>} input
 * @param {Object} [opts]
 * @param {string} [opts.name]
 * @param {number} [opts.capacity]
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
 * @param {number=} capacity
 * @returns {import('@endo/stream').Stream<Uint8Array, undefined>} input
 */
export const netstringReader = (input, name, capacity) => {
  return harden(
    makeNetstringIterator(input, {
      name,
      capacity,
    }),
  );
};
