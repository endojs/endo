// @ts-check

import { makePromiseKit } from '@endo/promise-kit';

/** @import { Reader, Writer } from '@endo/stream' */

// Size of the buffer handed to iroh's `recv.read` for each chunk. Netstring
// framing downstream reassembles messages across chunk boundaries, so this
// only bounds the per-read syscall size, not message size.
const READ_CHUNK_SIZE = 64 * 1024;

/**
 * Adapt an iroh bidirectional QUIC stream into @endo/stream-compatible
 * Reader<Uint8Array> and Writer<Uint8Array> pairs, suitable for use with
 * makeNetstringCapTP.
 *
 * iroh streams expose:
 *   - bi.send: SendStream with writeAll(Uint8Array), finish(), reset(code)
 *   - bi.recv: RecvStream with read(buf) -> bigint | null (null == EOF)
 *   - connection.closed(): Promise that settles when the connection closes
 *
 * The adapter depends only on this duck-typed shape, so it can be unit
 * tested with a fake stream and connection.
 *
 * @param {object} bi - An iroh BiStream.
 * @param {{ writeAll(buf: Uint8Array): Promise<unknown>, finish(): Promise<unknown>, reset(code: bigint): Promise<unknown> }} bi.send
 * @param {{ read(buf: Uint8Array): Promise<bigint | number | null> }} bi.recv
 * @param {{ closed?: () => Promise<unknown>, close?: (code: bigint, reason: Uint8Array) => void }} [connection]
 * @returns {{ reader: Reader<Uint8Array>, writer: Writer<Uint8Array>, closed: Promise<void> }}
 */
export const adaptIrohStream = (bi, connection = {}) => {
  const { send, recv } = bi;
  const { promise: closed, resolve: resolveClosed } = makePromiseKit();

  // Settle `closed` when the underlying connection closes, in addition to
  // EOF on the read side, so teardown is observed even if no read is pending.
  if (typeof connection.closed === 'function') {
    connection.closed().then(
      () => resolveClosed(undefined),
      () => resolveClosed(undefined),
    );
  }

  // --- Read direction ---
  /** @type {Reader<Uint8Array>} */
  const reader = harden({
    async next() {
      await null;
      try {
        const buf = new Uint8Array(READ_CHUNK_SIZE);
        const n = await recv.read(buf);
        if (n === null || n === undefined) {
          resolveClosed(undefined);
          return harden({ value: undefined, done: true });
        }
        const count = Number(n);
        if (count === 0) {
          // No bytes this turn but not EOF; yield an empty chunk and let the
          // caller poll again. Netstring tolerates empty reads.
          return harden({ value: new Uint8Array(0), done: false });
        }
        return harden({ value: buf.subarray(0, count), done: false });
      } catch (err) {
        resolveClosed(undefined);
        throw err;
      }
    },
    async return() {
      resolveClosed(undefined);
      return harden({ value: undefined, done: true });
    },
    async throw(error) {
      resolveClosed(undefined);
      throw error;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });

  // --- Write direction ---
  /** @type {Writer<Uint8Array>} */
  const writer = harden({
    async next(value) {
      await null;
      await send.writeAll(value);
      return harden({ value: undefined, done: false });
    },
    async return() {
      await null;
      try {
        await send.finish();
      } catch {
        // Peer may have already torn the stream down.
      }
      resolveClosed(undefined);
      return harden({ value: undefined, done: true });
    },
    async throw(error) {
      await null;
      try {
        await send.reset(0n);
      } catch {
        // Best-effort; the connection may already be gone.
      }
      if (typeof connection.close === 'function') {
        try {
          connection.close(0n, new TextEncoder().encode('error'));
        } catch {
          // Best-effort.
        }
      }
      resolveClosed(undefined);
      throw error;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });

  return harden({ reader, writer, closed });
};
harden(adaptIrohStream);
