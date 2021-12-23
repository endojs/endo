// @ts-check
/// <reference types="ses"/>

/* Adapts a Writer<Uint8Array> to a JSON Writer<any>, where reader and writer
 * streams are modeled as hybrid async iterators + generators.
 */
const textEncoder = new TextEncoder();

/**
 * @param {import('@endo/stream').Writer<Uint8Array, void>} writer
 */
export const makeJsonWriter = writer => {
  return harden({
    next(value) {
      const json = JSON.stringify(value);
      const bytes = textEncoder.encode(json);
      return writer.next(bytes);
    },
    throw(error) {
      return writer.throw(error);
    },
    return() {
      return writer.return();
    },
  });
};
harden(makeJsonWriter);
