// @ts-check

import { E } from '@endo/eventual-send';

import {
  parsePetNamePathArg,
  parseSignalInput,
  parseSignalReferences,
} from './signal-command.js';
import { applySignalInboundPolicy } from './signal-policy.js';

/** @import { SignalBridgeConfig, SignalInboundMessage } from './signal-types.js' */

/**
 * @typedef {{
 *   host: import('@endo/eventual-send').ERef<object>,
 *   transport: import('@endo/eventual-send').ERef<object>,
 *   initialConfig?: SignalBridgeConfig,
 * }} MakeSignalBridgeOptions
 */

/**
 * @typedef {{
 *   ignored: boolean,
 *   reason?: string,
 *   replyText?: string,
 * }} SignalHandleResult
 */

/**
 * @param {string | undefined} locator
 * @returns {string | undefined}
 */
export const parseFormulaTypeFromLocator = locator => {
  if (!locator) {
    return undefined;
  }
  try {
    const parsed = new URL(locator);
    const type = parsed.searchParams.get('type');
    return type || undefined;
  } catch {
    return undefined;
  }
};
harden(parseFormulaTypeFromLocator);

/**
 * @param {SignalBridgeConfig | undefined} maybeConfig
 * @returns {SignalBridgeConfig}
 */
const normalizeConfig = maybeConfig => {
  const mapping = {
    ...(maybeConfig && maybeConfig.agentForSender
      ? maybeConfig.agentForSender
      : {}),
  };
  return harden({
    groupMentionPrefix:
      (maybeConfig && maybeConfig.groupMentionPrefix) || '',
    agentForSender: harden(mapping),
  });
};

/**
 * @param {string} agentName
 * @param {string} threadKey
 * @returns {string}
 */
const makeConversationKey = (agentName, threadKey) =>
  `${agentName}::${threadKey}`;

/**
 * @param {import('@endo/eventual-send').ERef<object>} agent
 * @param {string[]} petNamePath
 */
const describeInventoryPath = async (agent, petNamePath) => {
  const id = await E(agent).identify(...petNamePath);
  if (!id) {
    return harden({
      id: undefined,
      locator: undefined,
      formulaType: undefined,
    });
  }
  let locator;
  try {
    locator = await E(agent).locate(...petNamePath);
  } catch {
    locator = undefined;
  }
  return harden({
    id,
    locator,
    formulaType: parseFormulaTypeFromLocator(locator),
  });
};

/**
 * @param {import('@endo/eventual-send').ERef<object>} agent
 * @param {string[]} pathPrefix
 */
const renderInventoryListing = async (agent, pathPrefix) => {
  const names = /** @type {string[]} */ (await E(agent).list(...pathPrefix));
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  if (sorted.length === 0) {
    const where = pathPrefix.length > 0 ? pathPrefix.join('/') : '.';
    return `No inventory entries at "${where}".`;
  }
  const lines = [];
  for (const name of sorted) {
    const fullPath = [...pathPrefix, name];
    // eslint-disable-next-line no-await-in-loop
    const entry = await describeInventoryPath(agent, fullPath);
    const formula = entry.formulaType || 'unknown';
    lines.push(`- ${fullPath.join('/')} type=${formula}`);
  }
  return lines.join('\n');
};

/**
 * @param {import('@endo/eventual-send').ERef<object>} transport
 * @param {SignalInboundMessage} envelope
 * @param {string} text
 */
const sendSignalReply = async (transport, envelope, text) => {
  if (typeof envelope.groupId === 'string' && envelope.groupId !== '') {
    await E(transport).sendGroup(envelope.groupId, text);
    return;
  }
  await E(transport).sendDirect(envelope.source, text);
};

/**
 * @param {MakeSignalBridgeOptions} options
 */
export const makeSignalBridge = options => {
  const host = options.host;
  const transport = options.transport;
  let config = normalizeConfig(options.initialConfig);

  /** @type {Map<string, { peerPetName: string, peerId: string }>} */
  const conversations = new Map();

  /**
   * @param {string} agentName
   * @returns {Promise<import('@endo/eventual-send').ERef<object> | undefined>}
   */
  const lookupAgent = async agentName => {
    await null;
    try {
      const has = await E(host).has(agentName);
      if (!has) {
        return undefined;
      }
      return E(host).lookup(agentName);
    } catch {
      return undefined;
    }
  };

  /**
   * @param {import('@endo/eventual-send').ERef<object>} agent
   * @param {string} peerPetName
   * @param {string} text
   */
  const sendConversationMessage = async (agent, peerPetName, text) => {
    const parsed = parseSignalReferences(text);
    await E(agent).send(
      peerPetName,
      parsed.strings,
      parsed.edgeNames,
      parsed.petNames,
    );
  };

  /**
   * @param {import('@endo/eventual-send').ERef<object>} agent
   * @param {string} agentName
   * @param {string} threadKey
   * @param {import('./signal-command.js').SignalSlashCommand} command
   * @returns {Promise<string>}
   */
  const executeCommand = async (agent, agentName, threadKey, command) => {
    const conversationKey = makeConversationKey(agentName, threadKey);
    if (command.name === 'help') {
      return [
        'Commands:',
        '/help',
        '/enter <handle-petname>',
        '/exit',
        '/who',
        '/list [path]',
        '/show <path>',
        '/send <text>',
        'Plain text sends to the active /enter conversation.',
        'Use @petname tokens in outgoing text to attach inventory refs.',
      ].join('\n');
    }
    if (command.name === 'enter') {
      const path = parsePetNamePathArg(command.args);
      if (path.length === 0) {
        return 'Usage: /enter <handle-petname>';
      }
      await null;
      const id = await E(agent).identify(...path);
      if (!id) {
        return `No inventory entry found for "${path.join('/')}".`;
      }
      conversations.set(conversationKey, {
        peerPetName: path.join('/'),
        peerId: id,
      });
      const info = await describeInventoryPath(agent, path);
      const type = info.formulaType || 'unknown';
      return `Entered conversation with @${path.join('/')} type=${type}.`;
    }
    if (command.name === 'exit') {
      conversations.delete(conversationKey);
      return 'Exited active conversation.';
    }
    if (command.name === 'who') {
      const state = conversations.get(conversationKey);
      if (!state) {
        return 'No active conversation. Use /enter <handle-petname>.';
      }
      return `Active conversation: @${state.peerPetName} id=${state.peerId}`;
    }
    if (command.name === 'list') {
      const path = command.args ? parsePetNamePathArg(command.args) : [];
      return renderInventoryListing(agent, path);
    }
    if (command.name === 'show') {
      const path = parsePetNamePathArg(command.args);
      if (path.length === 0) {
        return 'Usage: /show <path>';
      }
      const info = await describeInventoryPath(agent, path);
      if (!info.id) {
        return `No inventory entry found for "${path.join('/')}".`;
      }
      return [
        `name=${path.join('/')}`,
        `id=${info.id}`,
        `type=${info.formulaType || 'unknown'}`,
        `locator=${info.locator || '(unavailable)'}`,
      ].join('\n');
    }
    if (command.name === 'send') {
      const state = conversations.get(conversationKey);
      if (!state) {
        return 'No active conversation. Use /enter <handle-petname>.';
      }
      if (command.args.length === 0) {
        return 'Usage: /send <text>';
      }
      await sendConversationMessage(agent, state.peerPetName, command.args);
      return `Forwarded to @${state.peerPetName}.`;
    }
    return `Unknown command "/${command.name}". Use /help.`;
  };

  /**
   * @param {SignalInboundMessage} envelope
   * @returns {Promise<SignalHandleResult>}
   */
  const handleInbound = async envelope => {
    const decision = applySignalInboundPolicy(config, envelope);
    if (!decision.accepted) {
      return harden({ ignored: true, reason: decision.reason });
    }

    const agent = await lookupAgent(decision.agentName);
    if (!agent) {
      return harden({
        ignored: true,
        reason: `configured agent "${decision.agentName}" not found`,
      });
    }

    const input = parseSignalInput(decision.text);
    if (input.type === 'empty') {
      return harden({ ignored: true, reason: 'empty message' });
    }

    if (input.type === 'command') {
      const replyText = await executeCommand(
        agent,
        decision.agentName,
        decision.threadKey,
        input,
      );
      return harden({ ignored: false, replyText });
    }

    const conversationKey = makeConversationKey(
      decision.agentName,
      decision.threadKey,
    );
    const state = conversations.get(conversationKey);
    if (!state) {
      return harden({
        ignored: false,
        replyText:
          'No active conversation. Use /enter <handle-petname> first.',
      });
    }
    await sendConversationMessage(agent, state.peerPetName, input.text);
    return harden({
      ignored: false,
      replyText: `Forwarded to @${state.peerPetName}.`,
    });
  };

  /**
   * @param {number} [timeoutSeconds]
   */
  const pollOnce = async (timeoutSeconds = 1) => {
    const messages = /** @type {SignalInboundMessage[]} */ (
      await E(transport).receive(timeoutSeconds)
    );
    /** @type {Array<{ source: string, ignored: boolean, reason?: string }>} */
    const outcomes = [];
    for (const envelope of messages) {
      // eslint-disable-next-line no-await-in-loop
      const result = await handleInbound(envelope);
      outcomes.push({
        source: envelope.source,
        ignored: result.ignored,
        reason: result.reason,
      });
      if (!result.ignored && result.replyText) {
        // eslint-disable-next-line no-await-in-loop
        await sendSignalReply(transport, envelope, result.replyText);
      }
    }
    return harden(outcomes);
  };

  return harden({
    configure(nextConfig) {
      config = normalizeConfig(
        /** @type {SignalBridgeConfig} */ (nextConfig),
      );
      return config;
    },
    getConfig() {
      return config;
    },
    async handle(message) {
      const envelope = /** @type {SignalInboundMessage} */ (message);
      const result = await handleInbound(envelope);
      if (!result.ignored && result.replyText) {
        await sendSignalReply(transport, envelope, result.replyText);
      }
      return result;
    },
    pollOnce,
    help() {
      return (
        'Signal bridge for Endo daemon agents. ' +
        'Routes configured Signal senders to configured agents, supports ' +
        'slash commands and conversation forwarding with @petname refs. '
      );
    },
  });
};
harden(makeSignalBridge);
