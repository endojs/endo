#!/usr/bin/env node
// @ts-check
/* global process */

/**
 * Endo daemon CLI skill for Claude Code.
 *
 * Connects to the running Endo daemon via CapTP and exposes
 * subcommands for inspecting and interacting with agents, channels,
 * and the inbox.
 *
 * Usage:
 *   node endo-skill.js <command> [args...]
 *
 * Commands:
 *   inbox [agent]              List inbox messages (optionally for a specific agent)
 *   read-message <number>      Show full message details
 *   send <to> <text>           Send an inbox message
 *   names [agent]              List pet names (optionally for an agent's namespace)
 *   lookup <name> [agent]      Look up a value by pet name
 *   channel-messages <name>    List messages in a channel
 *   channel-members <name>     List channel members
 *   channel-post <name> <text> [replyTo]  Post to a channel
 *   agent-send <agent> <text>  Send a message to an agent
 *   help                       Show this help
 */

import '@endo/init/debug.js';

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { makeEndoClient } from '@endo/daemon';
import os from 'os';
import path from 'path';

/**
 * Wrap a remote async iterator reference for local consumption via CapTP.
 *
 * @param {any} iteratorRef
 * @returns {AsyncIterableIterator<any>}
 */
const makeRefIterator = iteratorRef => {
  const iterator = {
    next: async (/** @type {any[]} */ ...args) => E(iteratorRef).next(...args),
    return: async (/** @type {any[]} */ ...args) =>
      E(iteratorRef).return(...args),
    throw: async (/** @type {any} */ error) => E(iteratorRef).throw(error),
    [Symbol.asyncIterator]: () => iterator,
  };
  return iterator;
};

/** Resolve the daemon socket path (same logic as @endo/where). */
const getEndoSockPath = () => {
  if (process.env.ENDO_SOCK) return process.env.ENDO_SOCK;
  if (process.platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Endo',
      'captp0.sock',
    );
  }
  if (process.env.XDG_RUNTIME_DIR) {
    return path.join(process.env.XDG_RUNTIME_DIR, 'endo', 'captp0.sock');
  }
  return path.join(
    os.tmpdir(),
    `endo-${os.userInfo().username}`,
    'captp0.sock',
  );
};

const SOCK_PATH = getEndoSockPath();

/**
 * Connect to the daemon and get the host reference.
 *
 * @returns {Promise<{ host: any, cancel: (err: Error) => void }>}
 */
const connect = async () => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  const { getBootstrap } = await makeEndoClient(
    'claude-code-skill',
    SOCK_PATH,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = await E(bootstrap).host();
  return { host, cancel };
};

/**
 * Format a message for display.
 *
 * @param {any} msg
 * @returns {string}
 */
const formatMessage = msg => {
  const parts = [];
  parts.push(`#${msg.number} [${msg.type || 'unknown'}]`);
  if (msg.date) parts.push(` ${msg.date}`);
  if (msg.from) parts.push(` from:${msg.from.slice(0, 20)}...`);

  if (msg.type === 'package' && Array.isArray(msg.strings)) {
    const text = [];
    const names = Array.isArray(msg.names) ? msg.names : [];
    for (let i = 0; i < msg.strings.length; i++) {
      text.push(msg.strings[i]);
      if (i < names.length) text.push(`@${names[i]}`);
    }
    parts.push(`\n  ${text.join('').slice(0, 200)}`);
  } else if (msg.type === 'form') {
    parts.push(`\n  Form: ${msg.description || '(no description)'}`);
  } else if (msg.type === 'value') {
    parts.push(`\n  Value message (replyTo: ${msg.replyTo || 'none'})`);
  }

  if (msg.dismissed) parts.push(' [DISMISSED]');
  return parts.join('');
};

/**
 * Format a channel message for display.
 *
 * @param {any} msg
 * @param {Map<string, string>} [memberNames]
 * @returns {string}
 */
const formatChannelMessage = (msg, memberNames) => {
  const author =
    (memberNames && memberNames.get(msg.memberId)) || msg.memberId || '?';
  const text = Array.isArray(msg.strings) ? msg.strings.join('') : '';
  const replyTo = msg.replyTo ? ` (reply to ${msg.replyTo})` : '';
  const preview = text.length > 300 ? `${text.slice(0, 300)}...` : text;
  return `#${msg.number} ${author}${replyTo}: ${preview}`;
};

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const commands = {
  async inbox(host, args) {
    const agentName = args[0];
    /** @type {any} */
    let target = host;
    if (agentName) {
      target = await E(host).lookup(agentName);
    }
    const messages = /** @type {any[]} */ (await E(target).listMessages());
    if (messages.length === 0) {
      console.log('(no messages)');
      return;
    }
    for (const msg of messages) {
      console.log(formatMessage(msg));
    }
  },

  async 'read-message'(host, args) {
    const num = args[0];
    if (!num) {
      console.error('Usage: read-message <number>');
      process.exit(1);
    }
    const messages = /** @type {any[]} */ (await E(host).listMessages());
    const msg = messages.find(m => String(m.number) === num);
    if (!msg) {
      console.error(`Message #${num} not found`);
      process.exit(1);
    }
    console.log(JSON.stringify(msg, null, 2));
  },

  async send(host, args) {
    const [to, ...textParts] = args;
    const text = textParts.join(' ');
    if (!to || !text) {
      console.error('Usage: send <to> <text>');
      process.exit(1);
    }
    await E(host).send(to, [text], [], []);
    console.log(`Sent to ${to}: ${text}`);
  },

  async names(host, args) {
    const agentName = args[0];
    /** @type {any} */
    let target = host;
    if (agentName) {
      target = await E(host).lookup(agentName);
    }
    const petNames = /** @type {string[]} */ (await E(target).list());
    if (petNames.length === 0) {
      console.log('(no names)');
      return;
    }
    for (const name of [...petNames].sort()) {
      console.log(`  ${name}`);
    }
  },

  async lookup(host, args) {
    const [name, agentName] = args;
    if (!name) {
      console.error('Usage: lookup <name> [agent]');
      process.exit(1);
    }
    /** @type {any} */
    let target = host;
    if (agentName) {
      target = await E(host).lookup(agentName);
    }
    const value = await E(target).lookup(name);
    // Try to get method names for introspection
    try {
      const methods = await E(value).__getMethodNames__();
      console.log(`${name} methods: ${methods.join(', ')}`);
    } catch {
      try {
        console.log(`${name} = ${JSON.stringify(value, null, 2)}`);
      } catch {
        console.log(`${name} = [remotable object]`);
      }
    }
  },

  async 'channel-messages'(host, args) {
    const [channelName, countStr] = args;
    if (!channelName) {
      console.error('Usage: channel-messages <name> [count]');
      process.exit(1);
    }
    const channel = await E(host).lookup(channelName);
    const messages = /** @type {any[]} */ (await E(channel).listMessages());

    // Build member name lookup
    /** @type {Map<string, string>} */
    const memberNames = new Map();
    try {
      const members = /** @type {any[]} */ (await E(channel).getMembers());
      for (const m of members) {
        memberNames.set(m.memberId, m.proposedName || m.invitedAs);
      }
    } catch {
      // getMembers not available
    }
    // Add admin
    try {
      const adminId = await E(channel).getMemberId();
      const adminName = await E(channel).getProposedName();
      memberNames.set(adminId, adminName);
    } catch {
      // not available
    }

    const count = countStr ? parseInt(countStr, 10) : messages.length;
    const shown = messages.slice(-count);
    if (shown.length === 0) {
      console.log('(no messages)');
      return;
    }
    for (const msg of shown) {
      console.log(formatChannelMessage(msg, memberNames));
    }
  },

  async 'channel-members'(host, args) {
    const [channelName] = args;
    if (!channelName) {
      console.error('Usage: channel-members <name>');
      process.exit(1);
    }
    const channel = await E(host).lookup(channelName);

    // Admin info
    try {
      const adminId = await E(channel).getMemberId();
      const adminName = await E(channel).getProposedName();
      console.log(`Admin: ${adminName} (${adminId})`);
    } catch {
      console.log('Admin: (unknown)');
    }

    // Invited members
    try {
      const members = /** @type {any[]} */ (await E(channel).getMembers());
      for (const m of members) {
        const status = m.active ? 'active' : 'disabled';
        console.log(
          `  ${m.proposedName} (invitedAs: ${m.invitedAs}, id: ${m.memberId}, ${status})`,
        );
      }
    } catch (err) {
      console.log(`  (could not list members: ${err})`);
    }
  },

  async 'channel-post'(host, args) {
    const [channelName, ...textParts] = args;
    const replyToIdx = textParts.indexOf('--reply-to');
    const asIdx = textParts.indexOf('--as');
    let replyTo;
    let asMember;
    // Extract --reply-to and --as flags from text parts
    const flagIndices = new Set();
    if (replyToIdx >= 0) {
      replyTo = textParts[replyToIdx + 1];
      flagIndices.add(replyToIdx);
      flagIndices.add(replyToIdx + 1);
    }
    if (asIdx >= 0) {
      asMember = textParts[asIdx + 1];
      flagIndices.add(asIdx);
      flagIndices.add(asIdx + 1);
    }
    const text = textParts.filter((_, i) => !flagIndices.has(i)).join(' ');
    if (!channelName || !text) {
      console.error(
        'Usage: channel-post <name> <text> [--reply-to <n>] [--as <member>]',
      );
      process.exit(1);
    }
    const channel = await E(host).lookup(channelName);
    if (asMember) {
      const memberHandle = await E(channel).join(asMember);
      await E(memberHandle).post([text], [], [], replyTo);
    } else {
      await E(channel).post([text], [], [], replyTo);
    }
    const asLabel = asMember ? ` as ${asMember}` : '';
    console.log(
      `Posted to ${channelName}${asLabel}${replyTo ? ` (reply to ${replyTo})` : ''}: ${text}`,
    );
  },

  async 'channel-move'(host, args) {
    const [channelName, msgNumber, newParent, sortOrder] = args;
    if (!channelName || !msgNumber || !newParent) {
      console.error(
        'Usage: channel-move <channel> <msgNumber> <newParentNumber> [sortOrder]',
      );
      process.exit(1);
    }
    const channel = await E(host).lookup(channelName);
    const order = sortOrder || '1';
    const moveStrings = [order, newParent];
    await E(channel).post(moveStrings, [], [], msgNumber, [], 'move');
    console.log(
      `Moved #${msgNumber} under #${newParent} in ${channelName} (order: ${order})`,
    );
  },

  async 'agent-send'(host, args) {
    const [agentName, ...textParts] = args;
    const text = textParts.join(' ');
    if (!agentName || !text) {
      console.error('Usage: agent-send <agent> <text>');
      process.exit(1);
    }
    await E(host).send(agentName, [text], [], []);
    console.log(`Sent to ${agentName}: ${text}`);
  },

  async 'agent-inbox'(host, args) {
    const [agentName, countStr] = args;
    if (!agentName) {
      console.error('Usage: agent-inbox <agent-profile-name> [count]');
      process.exit(1);
    }
    const agentPowers = await E(host).lookup(agentName);
    const messages = /** @type {any[]} */ (await E(agentPowers).listMessages());
    const count = countStr ? parseInt(countStr, 10) : messages.length;
    const shown = messages.slice(-count);
    if (shown.length === 0) {
      console.log('(no messages)');
      return;
    }
    for (const msg of shown) {
      console.log(formatMessage(msg));
    }
  },

  async 'channel-watch'(host, args) {
    const [channelName, ...filterParts] = args;
    if (!channelName) {
      console.error('Usage: channel-watch <name> [--skip-from <member>]');
      process.exit(1);
    }
    const skipFromIdx = filterParts.indexOf('--skip-from');
    const skipFrom = skipFromIdx >= 0 ? filterParts[skipFromIdx + 1] : null;

    const channel = await E(host).lookup(channelName);

    // Build member name lookup
    /** @type {Map<string, string>} */
    const memberNames = new Map();
    try {
      const members = /** @type {any[]} */ (await E(channel).getMembers());
      for (const m of members) {
        memberNames.set(m.memberId, m.proposedName || m.invitedAs);
      }
    } catch {
      // getMembers not available
    }
    try {
      const adminId = await E(channel).getMemberId();
      const adminName = await E(channel).getProposedName();
      memberNames.set(adminId, adminName);
    } catch {
      // not available
    }

    // Get existing message count to skip
    const existing = /** @type {any[]} */ (await E(channel).listMessages());
    const existingCount = existing.length;
    console.error(
      `[watch] Watching ${channelName} (${existingCount} existing, streaming new)`,
    );

    let seen = 0;
    const iterRef = await E(channel).followMessages();
    const iter = makeRefIterator(iterRef);
    for await (const msg of iter) {
      seen += 1;
      if (seen <= existingCount) continue;

      const author = memberNames.get(msg.memberId) || msg.memberId || '?';
      // Skip messages from the filtered member
      if (skipFrom && author === skipFrom) continue;

      // Output the new message
      console.log(formatChannelMessage(msg, memberNames));
    }
  },

  async 'inbox-watch'(host, _args) {
    const existing = /** @type {any[]} */ (await E(host).listMessages());
    const existingCount = existing.length;
    console.error(
      `[watch] Watching HOST inbox (${existingCount} existing, streaming new)`,
    );

    let seen = 0;
    const iterRef = await E(host).followMessages();
    const iter = makeRefIterator(iterRef);
    for await (const msg of iter) {
      seen += 1;
      if (seen <= existingCount) continue;
      console.log(formatMessage(msg));
    }
  },

  async help() {
    console.log(`Endo Daemon Skill — Claude Code interface

Commands:
  inbox [agent]                    List HOST inbox (or agent's inbox if named)
  read-message <number>            Show full message details (JSON)
  send <to> <text>                 Send an inbox message from HOST
  names [agent]                    List pet names in HOST (or agent) namespace
  lookup <name> [agent]            Inspect a value by pet name
  channel-messages <name> [count]  List messages in a channel (last N)
  channel-members <name>           List channel members
  channel-post <name> <text> [--reply-to <n>] [--as <member>]
  channel-move <name> <msg> <newParent> [sortOrder]
  channel-watch <name> [--skip-from <member>]  Stream new messages
  inbox-watch                      Stream new HOST inbox messages
  agent-send <agent> <text>        Send message to an agent's inbox
  agent-inbox <profile> [count]    List an agent's inbox messages
  help                             Show this help`);
  },
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === 'help' || command === '--help') {
    await commands.help();
    process.exit(0);
  }

  if (!(command in commands)) {
    console.error(`Unknown command: ${command}`);
    await commands.help();
    process.exit(1);
  }

  const isWatch = command === 'channel-watch' || command === 'inbox-watch';
  const { host, cancel } = await connect();
  try {
    await commands[command](host, args);
  } finally {
    if (!isWatch) {
      cancel(Error('done'));
      // Give CapTP a moment to flush
      setTimeout(() => process.exit(0), 200);
    }
  }
};

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
