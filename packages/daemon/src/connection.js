// @ts-check

import { makeCapTP } from '@endo/captp';
import { mapWriter, mapReader } from '@endo/stream';
import { makeNetstringReader, makeNetstringWriter } from '@endo/netstring';
import { makeNodeReader, makeNodeWriter } from '@endo/stream-node';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * @template TBootstrap
 * @param {string} name
 * @param {import('@endo/stream').Stream<unknown, any, unknown, unknown>} writer
 * @param {import('@endo/stream').Stream<any, undefined, undefined, undefined>} reader
 * @param {Promise<void>} cancelled
 * @param {TBootstrap} bootstrap
 */
const makeCapTPWithStreams = (name, writer, reader, cancelled, bootstrap) => {
  /** @param {any} message */
  const send = message => {
    return writer.next(message);
  };

  const { dispatch, getBootstrap, abort } = makeCapTP(name, send, bootstrap);

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
    getBootstrap,
    closed,
  };
};

/** @param {any} message */
const messageToBytes = message => {
  const text = JSON.stringify(message);
  const bytes = textEncoder.encode(text);
  return bytes;
};

/** @param {Uint8Array} bytes */
const bytesToMessage = bytes => {
  const text = textDecoder.decode(bytes);
  const message = JSON.parse(text);
  return message;
};

/**
 * @template TBootstrap
 * @param {string} name
 * @param {import('stream').Writable} nodeWriter
 * @param {import('stream').Readable} nodeReader
 * @param {Promise<void>} cancelled
 * @param {TBootstrap} bootstrap
 */
export const makeNodeNetstringCapTP = (
  name,
  nodeWriter,
  nodeReader,
  cancelled,
  bootstrap,
) => {
  const writer = mapWriter(
    makeNetstringWriter(makeNodeWriter(nodeWriter), { chunked: true }),
    messageToBytes,
  );
  const reader = mapReader(
    makeNetstringReader(makeNodeReader(nodeReader)),
    bytesToMessage,
  );
  return makeCapTPWithStreams(name, writer, reader, cancelled, bootstrap);
};
