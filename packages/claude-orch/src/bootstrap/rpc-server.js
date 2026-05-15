// @ts-check
/* global setTimeout, clearTimeout */
/**
 * @import {
 *   BootConfigMessage,
 *   HelloMessage,
 * } from '../../protocol.types.d.ts'
 */

import net from 'node:net';

import { makePromiseKit } from '@endo/promise-kit';

/**
 * Bootstrap RPC server. Listens on the per-session ctl.sock UDS that the
 * QEMU chardev opens to expose virtserialport `orchestrator` to the guest
 * bootstrap init. Receives one Hello message, validates the boot nonce
 * via the supplied consumer, sends BootConfig, then closes the connection.
 *
 * The protocol is single request / single response. Anything else on this
 * channel is a protocol violation; the connection is closed.
 *
 * @param {{
 *   ctlSocketPath: string,
 *   sessionId: string,
 *   consumeNonce: (sessionId: string, nonce: string) => boolean,
 *   buildBootConfig: () => Promise<BootConfigMessage>,
 *   deadlineMs: number,
 * }} opts
 * @returns {Promise<HelloMessage>}
 */
export const awaitHello = ({
  ctlSocketPath,
  sessionId,
  consumeNonce,
  buildBootConfig,
  deadlineMs,
}) => {
  const { promise, resolve, reject } = makePromiseKit();

  const server = net.createServer({ allowHalfOpen: true });

  /** @type {NodeJS.Timeout} */
  const timer = setTimeout(() => {
    cleanup(
      new Error(
        `Boot deadline (${deadlineMs}ms) exceeded for session ${sessionId}.`,
      ),
    );
  }, deadlineMs);

  /** @param {Error | null} err */
  const cleanup = err => {
    clearTimeout(timer);
    server.close(() => {});
    if (err) reject(err);
  };

  server.once('error', cleanup);

  server.once('connection', conn => {
    let buf = '';
    conn.on('data', async chunk => {
      buf += chunk.toString('utf8');
      const newline = buf.indexOf('\n');
      if (newline < 0) return;

      const line = buf.slice(0, newline);
      buf = buf.slice(newline + 1);

      try {
        const msg = /** @type {HelloMessage} */ (JSON.parse(line));
        if (msg.type !== 'hello') {
          throw new Error(`Expected hello, got ${msg.type}`);
        }
        if (msg.sessionId !== sessionId) {
          throw new Error(
            `Hello sessionId mismatch: ${msg.sessionId} != ${sessionId}`,
          );
        }
        if (!consumeNonce(sessionId, msg.bootNonce)) {
          throw new Error(`Invalid or replayed boot nonce for ${sessionId}`);
        }
        const bootConfig = await buildBootConfig();
        conn.write(`${JSON.stringify(bootConfig)}\n`, () => {
          conn.end();
        });
        clearTimeout(timer);
        server.close();
        resolve(msg);
      } catch (e) {
        conn.destroy();
        cleanup(/** @type {Error} */ (e));
      }
    });
    conn.once('close', () => {
      // If hello hasn't resolved by now, treat as a boot failure.
      cleanup(
        new Error(
          `Bootstrap connection closed before Hello for session ${sessionId}.`,
        ),
      );
    });
  });

  server.listen(ctlSocketPath);
  return /** @type {Promise<HelloMessage>} */ (promise);
};
harden(awaitHello);
