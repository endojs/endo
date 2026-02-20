#!/usr/bin/env node
// @ts-check
/* global process, harden */

import '@endo/init';
import os from 'os';

import { E } from '@endo/eventual-send';
import { makePromiseKit } from '@endo/promise-kit';
import {
  whereEndoState,
  whereEndoEphemeralState,
  whereEndoSock,
  whereEndoCache,
} from '@endo/where';
import { makeEndoClient, start } from '@endo/daemon';
import { createProvider } from '@endo/lal/providers/index.js';

import { buildSystemPrompt } from './src/prompt.js';
import { runAgentLoop } from './src/agent.js';
import { installBuiltinTools } from './src/tools.js';
import { createTUI } from './src/tui.js';

const { username, homedir } = os.userInfo();
const temp = os.tmpdir();
const info = { user: username, home: homedir, temp };

const config = {
  statePath: whereEndoState(process.platform, process.env, info),
  ephemeralStatePath: whereEndoEphemeralState(
    process.platform,
    process.env,
    info,
  ),
  sockPath: whereEndoSock(process.platform, process.env, info),
  cachePath: whereEndoCache(process.platform, process.env, info),
};

/**
 * Attempt to connect to the daemon, starting it if necessary.
 *
 * @param {Promise<void>} cancelled
 * @returns {Promise<ReturnType<typeof makeEndoClient>>}
 */
const connectToDaemon = async cancelled => {
  try {
    return await makeEndoClient('fae', config.sockPath, cancelled);
  } catch {
    console.log('Starting Endo daemon...');
    await start(config);
    return makeEndoClient('fae', config.sockPath, cancelled);
  }
};

const main = async () => {
  const cwd = process.cwd();
  const tui = createTUI();

  tui.displayStatus('fae — Endo agent loop');
  tui.displayStatus('Commands: /new (reset), /quit (exit)\n');

  const env = {
    LAL_HOST: process.env.LAL_HOST,
    LAL_MODEL: process.env.LAL_MODEL,
    LAL_AUTH_TOKEN: process.env.LAL_AUTH_TOKEN,
    LAL_MAX_TOKENS: process.env.LAL_MAX_TOKENS,
    LAL_MAX_MESSAGES: process.env.LAL_MAX_MESSAGES,
  };

  const provider = createProvider(env);

  const { resolve: cancel, promise: cancelled } =
    /** @type {import('@endo/promise-kit').PromiseKit<void>} */ (
      makePromiseKit()
    );

  let connection;
  try {
    connection = await connectToDaemon(cancelled);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to connect to Endo daemon: ${msg}`);
    process.exit(1);
  }

  const bootstrap = connection.getBootstrap();
  const host = E(bootstrap).host();

  const localTools = installBuiltinTools(host, cwd);

  // Ensure the tools/ directory exists for daemon-side tool storage.
  try {
    await E(host).makeDirectory(['tools']);
  } catch {
    // Already exists.
  }

  const systemPrompt = buildSystemPrompt(cwd);

  /** @type {import('./src/agent.js').ChatMessage[]} */
  let transcript = [{ role: 'system', content: systemPrompt }];

  const callbacks = {
    onToolCall: tui.displayToolCall,
    onToolResult: tui.displayToolResult,
    onToolError: tui.displayToolError,
  };

  // Main interaction loop
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const input = await tui.prompt();
    if (input === null) {
      break;
    }
    if (input === '') {
      // eslint-disable-next-line no-continue
      continue;
    }
    if (input === '/new') {
      transcript = [{ role: 'system', content: systemPrompt }];
      tui.displayStatus('Conversation reset.\n');
      // eslint-disable-next-line no-continue
      continue;
    }

    tui.startSpinner();

    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await runAgentLoop(
        input,
        transcript,
        provider,
        host,
        localTools,
        callbacks,
      );
      tui.displayResponse(response);
    } catch (err) {
      tui.stopSpinner();
      const msg = err instanceof Error ? err.message : String(err);
      tui.displayToolError('agent', msg);
    }
  }

  tui.close();
  cancel(undefined);
  await connection.closed.catch(() => {});
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
