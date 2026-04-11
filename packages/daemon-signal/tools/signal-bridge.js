// @ts-check
/* global process */

import { makeExo } from '@endo/exo';
import { E } from '@endo/eventual-send';

import { makeSignalBridge } from '../src/signal-bridge.js';
import { DaemonSignalToolInterface } from '../src/tool-interface.js';

/**
 * Signal bridge caplet.
 * Composes host powers + signal-cli transport so messages can control an
 * Endo daemon agent over Signal.
 * Looks up 'signal-cli-transport' from the host inventory via powers.
 *
 * @param {import('@endo/eventual-send').ERef<object>} powers
 * @param {unknown} _context
 * @param {{ env?: Record<string, string | undefined> }} [options]
 */
// eslint-disable-next-line no-underscore-dangle
export const make = async (powers, _context, options = {}) => {
  await null;
  const { env = {} } = options;
  const envRecord = /** @type {Record<string, string | undefined>} */ (env);
  const groupMentionPrefix =
    envRecord.SIGNAL_GROUP_PREFIX || process.env.SIGNAL_GROUP_PREFIX || '';

  /** @type {Record<string, string>} */
  let agentForSender = {};
  const agentMapJson =
    envRecord.SIGNAL_AGENT_MAP_JSON || process.env.SIGNAL_AGENT_MAP_JSON || '';
  if (agentMapJson) {
    try {
      const parsed = JSON.parse(agentMapJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        agentForSender = /** @type {Record<string, string>} */ (parsed);
      }
    } catch {
      // ignore malformed JSON
    }
  }

  const initialConfig = {
    groupMentionPrefix,
    agentForSender,
  };

  const transport = await E(powers).lookup('signal-cli-transport');
  const bridge = makeSignalBridge({
    host: powers,
    transport,
    initialConfig,
  });

  return makeExo('SignalBridgeTool', DaemonSignalToolInterface, {
    schema() {
      return harden({
        type: 'function',
        function: {
          name: 'signalBridge',
          description:
            'Control and poll a signal-to-endo bridge instance. ' +
            'Actions: configure, pollOnce, handle, getConfig.',
          parameters: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              config: { type: 'object' },
              timeoutSeconds: { type: 'number' },
              message: { type: 'object' },
            },
            required: ['action'],
          },
        },
      });
    },
    async execute(args) {
      const { action } = /** @type {{ action: string }} */ (args);
      if (action === 'configure') {
        const { config } = /** @type {{ config: object }} */ (args);
        return JSON.stringify(bridge.configure(config), null, 2);
      }
      if (action === 'getConfig') {
        return JSON.stringify(bridge.getConfig(), null, 2);
      }
      if (action === 'pollOnce') {
        const { timeoutSeconds = 1 } =
          /** @type {{ timeoutSeconds?: number }} */ (args);
        const result = await bridge.pollOnce(timeoutSeconds);
        return JSON.stringify(result, null, 2);
      }
      if (action === 'handle') {
        const { message } = /** @type {{ message: object }} */ (args);
        const result = await bridge.handle(message);
        return JSON.stringify(result, null, 2);
      }
      throw new Error(
        `Unknown action "${action}". Use configure|getConfig|pollOnce|handle.`,
      );
    },
    help() {
      return bridge.help();
    },
  });
};
harden(make);
