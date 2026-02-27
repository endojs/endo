// @ts-check

import { makeCapTP } from '@endo/captp';
import { makePromiseKit } from '@endo/promise-kit';
import { mapWriter, mapReader } from '@endo/stream';
import { makeNetstringReader, makeNetstringWriter } from '@endo/netstring';

/** @import { Stream, Reader, Writer } from '@endo/stream' */
/** @import { CapTpConnectionRegistrar } from './types.js' */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * @param {CapTpConnectionRegistrar | undefined} registrar
 * @param {string} name
 * @param {(reason?: Error) => Promise<void>} close
 * @param {Promise<void>} closed
 * @returns {import('@endo/captp').CapTPOptions}
 */
const registerCapTpConnection = (registrar, name, close, closed) => {
  if (registrar === undefined) {
    return {};
  }
  return registrar({ name, close, closed });
};

/**
 * @template TBootstrap
 * @param {string} name
 * @param {Stream<unknown, any, unknown, unknown>} writer
 * @param {Stream<any, undefined, undefined, undefined>} reader
 * @param {Promise<void>} cancelled
 * @param {TBootstrap} bootstrap
 * @param {import('@endo/captp').CapTPOptions} [capTpOptions]
 * @param {CapTpConnectionRegistrar} [capTpConnectionRegistrar]
 */
export const makeMessageCapTP = (
  name,
  writer,
  reader,
  cancelled,
  bootstrap,
  capTpOptions = undefined,
  capTpConnectionRegistrar = undefined,
) => {
  /** @param {any} message */
  const send = message => {
    try {
      return writer.next(message);
    } catch (sendError) {
      return Promise.reject(sendError);
    }
  };

  const { promise: closedPromise, resolve: resolveClosed } = makePromiseKit();

  // The registrar receives `close` before CapTP is initialized, but
  // it only stashes it for later use — it never calls it synchronously.
  // We rely on this invariant to define `close` as a forward reference
  // that captures `abort` and `drained` from the CapTP setup below.
  /** @type {(reason?: Error) => Promise<void>} */
  let close;

  const registrarOptions = registerCapTpConnection(
    capTpConnectionRegistrar,
    name,
    reason => close(reason),
    closedPromise,
  );
  const mergedOptions = { ...registrarOptions, ...capTpOptions };
  const { dispatch, getBootstrap, abort } = makeCapTP(
    name,
    send,
    bootstrap,
    mergedOptions,
  );

  const drained = (async () => {
    for await (const message of reader) {
      dispatch(message);
    }
  })();

  let isClosed = false;
  close = reason => {
    if (isClosed) {
      return closedPromise;
    }
    isClosed = true;
    abort(reason);
    Promise.all([
      writer.return(undefined).catch(() => {}),
      drained.catch(() => {}),
    ]).then(() => {
      resolveClosed(undefined);
    });
    return closedPromise;
  };

  const closedP = cancelled.catch(error => {
    close(error);
  });
  const closedRace = Promise.race([closedP, closedPromise]);

  return {
    getBootstrap,
    closed: closedRace,
    close,
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
 * @param {TBootstrap} bootstrap
 * @param {import('@endo/captp').CapTPOptions} [capTpOptions]
 * @param {CapTpConnectionRegistrar} [capTpConnectionRegistrar]
 */
export const makeNetstringCapTP = (
  name,
  bytesWriter,
  bytesReader,
  cancelled,
  bootstrap,
  capTpOptions = undefined,
  capTpConnectionRegistrar = undefined,
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
    capTpOptions,
    capTpConnectionRegistrar,
  );
};
