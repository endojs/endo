// @ts-check
/**
 * @import {
 *   AgentToOrchMessage,
 *   OrchToAgentMessage,
 * } from '../../protocol.types.d.ts'
 */

import net from 'node:net';

import { makePromiseKit } from '@endo/promise-kit';

/**
 * @typedef {object} AgentLink
 * @property {() => Promise<void>} ready                Resolved when the agent sends its first `ready` message.
 * @property {(msg: OrchToAgentMessage) => void} send
 * @property {(handler: (msg: AgentToOrchMessage) => void) => void} onMessage
 * @property {(handler: () => void) => void} onClose
 * @property {() => void} close
 */

/**
 * Open a long-lived JSON-RPC link to the per-session runtime agent.
 *
 * Returns synchronously with two promises:
 *   - `ready` resolves when the UDS is bound and accepting connections.
 *   - `link` resolves with the AgentLink once the guest agent connects.
 *
 * @param {{ agentSocketPath: string }} opts
 * @returns {{ ready: Promise<void>, link: Promise<AgentLink> }}
 */
export const makeAgentLink = ({ agentSocketPath }) => {
  const linkKit = makePromiseKit();
  const readyKit = makePromiseKit();

  const server = net.createServer({ allowHalfOpen: false });
  /** @type {net.Socket | null} */
  let conn = null;
  /** @type {((msg: AgentToOrchMessage) => void)[]} */
  const messageHandlers = [];
  /** @type {(() => void)[]} */
  const closeHandlers = [];
  const agentReadyKit = makePromiseKit();

  server.once('error', linkKit.reject);

  server.once('connection', socket => {
    conn = socket;
    socket.on('error', () => {
      // Peer (guest agent) may RST on teardown; suppress.
    });
    let buf = '';
    socket.on('data', chunk => {
      buf += chunk.toString('utf8');
      for (;;) {
        const i = buf.indexOf('\n');
        if (i < 0) break;
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line.length > 0) {
          try {
            const msg = /** @type {AgentToOrchMessage} */ (JSON.parse(line));
            if (msg.type === 'ready') agentReadyKit.resolve(undefined);
            for (const h of messageHandlers) h(msg);
          } catch (_e) {
            // Malformed line; ignore. Agent is untrusted so we don't crash.
          }
        }
      }
    });
    socket.once('close', () => {
      conn = null;
      for (const h of closeHandlers) h();
    });

    /** @type {AgentLink} */
    const link = harden({
      ready: () => agentReadyKit.promise,
      send: msg => {
        if (!conn) return;
        conn.write(`${JSON.stringify(msg)}\n`);
      },
      onMessage: handler => {
        messageHandlers.push(handler);
      },
      onClose: handler => {
        closeHandlers.push(handler);
      },
      close: () => {
        if (conn) conn.end();
        server.close();
      },
    });
    linkKit.resolve(link);
  });

  server.listen(agentSocketPath, () => readyKit.resolve(undefined));

  return harden({
    ready: /** @type {Promise<void>} */ (readyKit.promise),
    link: /** @type {Promise<AgentLink>} */ (linkKit.promise),
  });
};
harden(makeAgentLink);
