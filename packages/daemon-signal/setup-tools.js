// @ts-check
/* global process */
// endo run --UNCONFINED setup-tools.js --powers @agent
//
// Creates Signal integration objects in host inventory:
// - signal-cli transport object backed by signal-cli
// - signal bridge tool object that maps Signal messages to Endo agents
//
// Required env:
// - SIGNAL_ACCOUNT: signal-cli account phone number (e.g. +15551234567)
//
// Optional env:
// - SIGNAL_CLI_BIN: signal-cli binary path (default: signal-cli)
// - SIGNAL_GROUP_PREFIX: required mention prefix for group messages
// - SIGNAL_AGENT_MAP_JSON: JSON object mapping Signal sender -> agent petname

import { E } from '@endo/eventual-send';

/**
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  const signalAccount = process.env.SIGNAL_ACCOUNT;
  if (!signalAccount) {
    throw new Error(
      'SIGNAL_ACCOUNT is required (example: SIGNAL_ACCOUNT=+15551234567)',
    );
  }
  const signalCliBin = process.env.SIGNAL_CLI_BIN || 'signal-cli';
  const groupPrefix = process.env.SIGNAL_GROUP_PREFIX || '';

  /** @type {Record<string, string>} */
  let senderMap = {};
  if (process.env.SIGNAL_AGENT_MAP_JSON) {
    const parsed = JSON.parse(process.env.SIGNAL_AGENT_MAP_JSON);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('SIGNAL_AGENT_MAP_JSON must be a JSON object');
    }
    senderMap = /** @type {Record<string, string>} */ (parsed);
  }

  const signalCliUrl = new URL('tools/signal-cli.js', import.meta.url).href;
  const signalBridgeUrl = new URL('tools/signal-bridge.js', import.meta.url)
    .href;

  await E(agent).makeUnconfined('MAIN', signalCliUrl, {
    resultName: 'signal-cli-transport',
    env: harden({
      SIGNAL_ACCOUNT: signalAccount,
      SIGNAL_CLI_BIN: signalCliBin,
    }),
  });
  console.log('[setup-tools] Created signal-cli-transport');

  await E(agent).makeUnconfined('MAIN', signalBridgeUrl, {
    resultName: 'signal-bridge-tool',
    powersName: 'AGENT',
    env: harden({
      SIGNAL_GROUP_PREFIX: groupPrefix,
      SIGNAL_AGENT_MAP_JSON: JSON.stringify(senderMap),
    }),
  });
  console.log('[setup-tools] Created signal-bridge-tool');

  if (groupPrefix || Object.keys(senderMap).length > 0) {
    const bridgeTool = await E(agent).lookup('signal-bridge-tool');
    const configureResult = await E(bridgeTool).execute({
      action: 'configure',
      config: harden({
        groupMentionPrefix: groupPrefix,
        agentForSender: senderMap,
      }),
    });
    console.log(`[setup-tools] Applied bridge config: ${configureResult}`);
  }

  await E(agent).storeValue(
    harden({
      signalAccount,
      signalCliBin,
      groupMentionPrefix: groupPrefix,
      agentForSender: senderMap,
    }),
    'signal-bridge-config',
  );
  console.log('[setup-tools] Stored signal-bridge-config');
};
harden(main);
