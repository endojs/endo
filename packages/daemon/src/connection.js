// @ts-check
/* global process */

import { makeCapTP } from '@endo/captp';
import { isPassable, passableAsJustin } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import { mapWriter, mapReader } from '@endo/stream';
import { makeNetstringReader, makeNetstringWriter } from '@endo/netstring';
import { bytesFromText } from '@endo/bytes/from-string.js';
import { bytesToText } from '@endo/bytes/to-string.js';

/** @import { Stream, Reader, Writer } from '@endo/stream' */
/** @import { CapTpConnectionRegistrar } from './types.js' */

/**
 * Sentinel marker for an Error encoded as a plain object on the
 * `CTP_DISCONNECT.reason` wire shape. The marker disambiguates an
 * encoded Error from an arbitrary plain object that happens to carry
 * `name`, `message`, or `stack` fields.
 */
const ERROR_SENTINEL = '@@error';

/**
 * Render a CapTP rejection reason as a string suitable for diagnostic
 * display. Recognizes three shapes:
 *
 * 1. A real `Error` instance (from the local realm, before the wire
 *    round-trip strips it).
 * 2. The `{ '@@error': true, name, message, stack }` plain shape that
 *    `messageToBytes` emits for Error reasons on `CTP_DISCONNECT`.
 * 3. Any other Passable, rendered through `passableAsJustin` (the
 *    project-standard diagnostic renderer).
 *
 * As a last defence, non-Passable reasons fall through to
 * `String(reason)` annotated with their type tag, so an unexpected
 * reason still produces something readable in the trap.
 *
 * @param {unknown} reason
 * @returns {string}
 */
export const renderRejection = reason => {
  if (reason instanceof Error) {
    return `${reason.name}: ${reason.message}\n${reason.stack || ''}`;
  }
  if (
    reason !== null &&
    typeof reason === 'object' &&
    /** @type {any} */ (reason)[ERROR_SENTINEL] === true
  ) {
    const {
      name = 'Error',
      message = '',
      stack = '',
    } = /** @type {{name?: string, message?: string, stack?: string}} */ (
      reason
    );
    return `${name}: ${message}\n${stack}`;
  }
  if (isPassable(reason)) {
    return passableAsJustin(reason);
  }
  return `(non-passable ${typeof reason}) ${String(reason)}`;
};
harden(renderRejection);

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
  // eslint-disable-next-line no-undef
  const traceCapTP =
    typeof process !== 'undefined' && process.env.ENDO_CAPTP_TRACE;

  /** @param {any} message */
  const send = message => {
    if (traceCapTP) {
      console.log(
        `[captp:${name}] SEND`,
        JSON.stringify(message).slice(0, 200),
      );
    }
    try {
      const writeP = Promise.resolve(writer.next(message));
      // Swallow rejections from writes that race with peer disconnect
      // (e.g. CTP_DISCONNECT after the other side has already FIN'd).
      // Without this, CapTP teardown produces "This socket has been
      // ended by the other party" rejections that fail otherwise-clean
      // test runs under AVA's strict unhandled-rejection policy.
      writeP.catch(err => {
        const msg = String((err && err.message) || err || '');
        const isPostDisconnect =
          msg.includes('socket has been ended') ||
          msg.includes('write after end') ||
          msg.includes('EPIPE') ||
          msg.includes('ECONNRESET');
        if (!isPostDisconnect) {
          // Still log non-disconnect errors for visibility.
          console.error(`CapTP ${name} send error:`, msg);
        }
      });
      return writeP;
    } catch (sendError) {
      console.error(
        `CapTP ${name} send error:`,
        /** @type {Error} */ (sendError).message,
      );
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
  const defaultOnReject = err => {
    console.error(`CapTP ${name} exception:`, renderRejection(err));
  };
  const mergedOptions = {
    onReject: defaultOnReject,
    ...registrarOptions,
    ...capTpOptions,
  };
  const { dispatch, getBootstrap, abort } = makeCapTP(
    name,
    send,
    bootstrap,
    mergedOptions,
  );

  const drained = (async () => {
    for await (const message of reader) {
      if (traceCapTP) {
        console.log(
          `[captp:${name}] RECV`,
          JSON.stringify(message).slice(0, 200),
        );
      }
      dispatch(message);
    }
  })();

  drained.then(
    () => close(new Error('Connection stream ended')),
    error => close(error),
  );

  let isClosed = false;
  close = reason => {
    if (isClosed) {
      return closedPromise;
    }
    isClosed = true;
    abort(reason);
    Promise.all([
      writer
        .return(undefined)
        // .catch(e => {
        //   // EPIPE errors occur when the peer has already closed the connection.
        //   // This is expected during graceful shutdown and not an error condition.
        //   const isPrematureClose =
        //     e.code === 'EPIPE' || e.code === 'ERR_STREAM_PREMATURE_CLOSE';
        //   if (!isPrematureClose) {
        //     throw e;
        //   }
        // })
        .catch(() => {}),
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
  let outgoing = message;
  // Error own-properties (`message`, `stack`, `name`) are non-enumerable
  // and therefore invisible to `JSON.stringify`. Without this branch, a
  // `CTP_DISCONNECT` carrying an Error reason arrives at the peer as
  // `{"reason":{}}` and the receiver-side trap loses the diagnostic.
  // The narrow type guard keeps the fast path for `CTP_CALL` and
  // friends, which already serialize Error fulfilments through
  // `@endo/marshal`.
  if (
    message !== null &&
    typeof message === 'object' &&
    message.type === 'CTP_DISCONNECT' &&
    message.reason instanceof Error
  ) {
    const { name: errName, message: errMessage, stack } = message.reason;
    outgoing = {
      ...message,
      reason: {
        [ERROR_SENTINEL]: true,
        name: errName,
        message: errMessage,
        stack,
      },
    };
  }
  const text = JSON.stringify(outgoing);
  const bytes = bytesFromText(text);
  return bytes;
};

/** @param {Uint8Array} bytes */
export const bytesToMessage = bytes => {
  const text = bytesToText(bytes);
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
