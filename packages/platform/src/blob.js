// @ts-check

import { encodeBase64 } from '@endo/base64';
import { bytesToText } from '@endo/bytes/to-string.js';
import { makeExo } from '@endo/exo';
import { makeReaderPump } from '@endo/exo-stream/reader-pump.js';
import harden from '@endo/harden';

import { ReadableBlobInterface } from './fs/interfaces.js';

const BASE64_CHUNK_RAW_BYTES = 48 * 1024;

/**
 * @param {Uint8Array | Promise<Uint8Array>} bytesOrPromise
 */
async function* base64Chunks(bytesOrPromise) {
  const bytes = await bytesOrPromise;
  for (
    let offset = 0;
    offset < bytes.length;
    offset += BASE64_CHUNK_RAW_BYTES
  ) {
    const end = Math.min(offset + BASE64_CHUNK_RAW_BYTES, bytes.length);
    yield encodeBase64(bytes.subarray(offset, end));
  }
}

/**
 * Make a ReadableBlob from bytes that may be available asynchronously.
 *
 * @param {Uint8Array | Promise<Uint8Array>} bytesOrPromise
 */
export const blobFromBytes = bytesOrPromise => {
  const bytes = () => Promise.resolve(bytesOrPromise);
  return makeExo('Blob', ReadableBlobInterface, {
    /** @param {unknown} synHead */
    streamBase64: synHead =>
      makeReaderPump(base64Chunks(bytes()))(/** @type {any} */ (synHead)),
    text: () => bytes().then(bytesToText),
    json: () =>
      bytes().then(resolvedBytes => JSON.parse(bytesToText(resolvedBytes))),
    /** @param {string} [method] */
    help: method =>
      method === undefined
        ? 'Blob: read-only bytes (streamBase64, text, json).'
        : `No documentation for method ${method}.`,
  });
};
harden(blobFromBytes);
