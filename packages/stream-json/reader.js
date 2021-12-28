// @ts-check
/// <reference types="ses"/>

/* Adapts a Reader<Uint8Array> to a JSON object Reader<any> where reader and
 * writer streams are modeled as hybrid async iterators + generators.
 */
const textDecoder = new TextDecoder();

/**
 * @param {import('@endo/stream').Reader<Uint8Array, undefined>} reader
 */
async function* makeJsonAsyncIterator(reader) {
  for await (const bytes of reader) {
    const text = textDecoder.decode(bytes);
    yield JSON.parse(text);
  }
}

/**
 * @param {import('@endo/stream').Reader<Uint8Array, undefined>} reader
 * @returns {import('@endo/stream').Reader<ReturnType<JSON.parse>, undefined>}
 */
export const makeJsonReader = reader => {
  return harden(makeJsonAsyncIterator(reader));
};
harden(makeJsonReader);
