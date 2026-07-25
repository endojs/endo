// @ts-check

import harden from '@endo/harden';
import { makePromiseKit } from '@endo/promise-kit';

/** @import { Reader, Writer } from '@endo/stream' */

// Maximum number of bytes requested from iroh's `recv.read` per chunk.
// Netstring framing downstream reassembles messages across chunk
// boundaries, so this only bounds the per-read syscall size, not message
// size.
const READ_CHUNK_SIZE = 64 * 1024;

/**
 * Adapt an iroh bidirectional QUIC stream into @endo/stream-compatible
 * Reader<Uint8Array> and Writer<Uint8Array> pairs. Mirrors the daemon's
 * `packages/daemon/src/networks/iroh-stream-adapter.js`.
 *
 * iroh streams (as of `@number0/iroh` 1.0) expose:
 *   - bi.send: SendStream with writeAll(Array<number>), finish(), reset(code)
 *   - bi.recv: RecvStream with read(sizeLimit) -> bytes (empty == EOF)
 *   - connection.closed(): Promise that settles when the connection closes
 *
 * The binding takes byte payloads as plain `Array<number>` (napi marshals
 * `Vec<u8>` from a JS Array, not a TypedArray) and returns reads as a
 * byte-valued array-like, so the adapter converts at the boundary.
 *
 * The adapter depends only on this duck-typed shape, so it can be unit
 * tested with a fake stream and connection.
 *
 * @param {object} bi - An iroh BiStream.
 * @param {{ writeAll(buf: number[]): Promise<unknown>, finish(): Promise<unknown>, reset(code: bigint): Promise<unknown> }} bi.send
 * @param {{ read(sizeLimit: number): Promise<ArrayLike<number> | null | undefined> }} bi.recv
 * @param {{ closed?: () => Promise<unknown>, close?: (code: bigint, reason: number[]) => void }} [connection]
 * @returns {{ reader: Reader<Uint8Array>, writer: Writer<Uint8Array>, closed: Promise<void> }}
 */
export const adaptIrohStream = (bi, connection = {}) => {
  const { send, recv } = bi;
  const { promise: closed, resolve: resolveClosed } = makePromiseKit();

  // Settle `closed` when the underlying connection closes, in addition to
  // EOF on the read side, so teardown is observed even if no read is
  // pending.
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
        const chunk = await recv.read(READ_CHUNK_SIZE);
        // An empty (or absent) result signals EOF: iroh's QUIC `read` only
        // resolves with zero bytes once the stream has finished — it never
        // yields an empty, non-EOF read while the stream is open.
        if (chunk === null || chunk === undefined || chunk.length === 0) {
          resolveClosed(undefined);
          return harden({ value: undefined, done: true });
        }
        // `read` returns an `Array<number>` (or Buffer); normalise to a
        // Uint8Array for the netstring layer.
        return harden({ value: new Uint8Array(chunk), done: false });
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
      // The binding's `writeAll` takes a plain `Array<number>`, not a
      // TypedArray.
      await send.writeAll(Array.from(value));
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
          connection.close(0n, Array.from(new TextEncoder().encode('error')));
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
