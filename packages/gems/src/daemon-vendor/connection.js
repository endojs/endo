// @ts-check

import { makeCapTP } from '@endo/captp';
import { mapWriter, mapReader } from '@endo/stream';
import { makeNetstringReader, makeNetstringWriter } from '@endo/netstring';

/** @import { Stream, Reader, Writer } from '@endo/stream' */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * @template TBootstrap
 * @param {string} name
 * @param {Stream<unknown, any, unknown, unknown>} writer
 * @param {Stream<any, undefined, undefined, undefined>} reader
 * @param {Promise<void>} cancelled
 * @param opts
 * @param {TBootstrap} bootstrap
 */
export const makeMessageCapTP = (
  name,
  writer,
  reader,
  cancelled,
  bootstrap,
  opts,
) => {
  /** @param {any} message */
  const send = message => {
    return writer.next(message);
  };

  const captp = makeCapTP(name, send, bootstrap, opts);
  const { dispatch, getBootstrap, abort } = captp;

  const drained = (async () => {
    for await (const message of reader) {
      dispatch(message);
    }
  })();

  const closed = cancelled.catch(async () => {
    abort();
    await Promise.all([writer.return(undefined), drained]);
  });

  return {
    captp,
    getBootstrap,
    closed,
  };
};

/** @param {any} message */
export const messageToBytes = message => {
  const text = JSON.stringify(message);
  // console.log('->', text);
  const bytes = textEncoder.encode(text);
  return bytes;
};

/** @param {Uint8Array} bytes */
export const bytesToMessage = bytes => {
  const text = textDecoder.decode(bytes);
  // console.log('<-', text);
  const message = JSON.parse(text);
  return message;
};

/**
 * @template TBootstrap
 * @param {string} name
 * @param {Writer<Uint8Array>} bytesWriter
 * @param {Reader<Uint8Array>} bytesReader
 * @param {Promise<void>} cancelled
 * @param captpOpts
 * @param {TBootstrap} bootstrap
 */
export const makeNetstringCapTP = (
  name,
  bytesWriter,
  bytesReader,
  cancelled,
  bootstrap,
  captpOpts,
) => {
  const messageWriter = mapWriter(
    makeNetstringWriter(bytesWriter, { chunked: true }),
    messageToBytes,
  );
  const messageReader = mapReader(
    makeNetstringReader(bytesReader),
    bytesToMessage,
  );
  return makeMessageCapTP(
    name,
    messageWriter,
    messageReader,
    cancelled,
    bootstrap,
    captpOpts,
  );
};
