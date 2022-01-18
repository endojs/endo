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
 * @param {TBootstrap} bootstrap
 */
const makeCapTPWithStreams = (name, writer, reader, bootstrap) => {
  /** @param {any} message */
  const send = message => {
    return writer.next(message);
  };

  // TODO cancellation context
  const { dispatch, getBootstrap, abort } = makeCapTP(name, send, bootstrap);

  const drained = (async () => {
    for await (const message of reader) {
      dispatch(message);
    }
  })();

  return {
    getBootstrap,
    drained,
    finalize() {
      abort();
      return writer.return(undefined);
    },
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
 * @param {import('net').Socket} conn
 * @param {TBootstrap} bootstrap
 */
export const makeCapTPWithConnection = (name, conn, bootstrap) => {
  const writer = mapWriter(
    makeNetstringWriter(makeNodeWriter(conn)),
    messageToBytes,
  );
  const reader = mapReader(
    makeNetstringReader(makeNodeReader(conn)),
    bytesToMessage,
  );
  return makeCapTPWithStreams(name, writer, reader, bootstrap);
};
