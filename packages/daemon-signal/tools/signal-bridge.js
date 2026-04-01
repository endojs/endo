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
 *
 * @param {import('@endo/eventual-send').ERef<object>} powers
 */
export const make = async powers => {
  await null;
  const account = process.env.SIGNAL_ACCOUNT;
  if (!account) {
    throw new Error('SIGNAL_ACCOUNT environment variable is required');
  }
  const signalCliBin = process.env.SIGNAL_CLI_BIN || 'signal-cli';
  const initialConfig = {
    groupMentionPrefix: process.env.SIGNAL_GROUP_PREFIX || '',
    agentForSender: {},
  };
  const transport = await E(powers).makeUnconfined(
    '@main',
    new URL('signal-cli.js', import.meta.url).href,
    {
      resultName: `signal-cli-for-${account.replace(/[^a-z0-9-]/giu, '-')}`,
      env: harden({
        SIGNAL_ACCOUNT: account,
        SIGNAL_CLI_BIN: signalCliBin,
      }),
    },
  );
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
