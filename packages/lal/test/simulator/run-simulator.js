#!/usr/bin/env node
// @ts-check
/**
 * Standalone runner for the Lal agent simulator.
 * Uses mock guest powers and real LLM providers (Anthropic, etc.) via env.
 *
 * Usage:
 *   node test/simulator/run-simulator.js [env-file]
 *   node test/simulator/run-simulator.js anthropic.dev
 *   LAL_HOST=... LAL_AUTH_TOKEN=... node test/simulator/run-simulator.js
 *
 * If the first argument is a path to a file, it is loaded and export KEY=value
 * lines are applied to process.env (so you can inject e.g. anthropic.dev).
 * The simulator delivers one inbox message from HOST, runs the agent until it
 * dismisses that message (or timeout), then exits.
 */

import '@endo/init';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { make } from '../../agent.js';
import { makeMockPowers } from './mock-powers.js';

const TIMEOUT_MS = 120_000;

/**
 * Load export KEY=value lines from a file into process.env.
 * @param {string} filePath - Path to env file (relative to cwd or absolute)
 */
function loadEnvFile(filePath) {
  const resolved = resolve(process.cwd(), filePath);
  if (!existsSync(resolved)) {
    console.error('[simulator] Env file not found:', resolved);
    process.exitCode = 1;
    process.exit(1);
  }
  const content = readFileSync(resolved, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^export\s+(\w+)=(.*)$/);
    if (match) {
      const key = match[1];
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
  console.log('[simulator] Loaded env from', resolved);
}

async function main() {
  const envFile = process.argv[2];
  if (envFile) {
    loadEnvFile(envFile);
  }

  const env = process.env;
  if (!env.LAL_AUTH_TOKEN && (env.LAL_HOST || '').includes('anthropic.com')) {
    console.error('LAL_AUTH_TOKEN is required for Anthropic. Set it and try again.');
    process.exitCode = 1;
    return;
  }

  console.log('[simulator] Creating mock powers and starting agent...');
  console.log('[simulator] LAL_HOST:', env.LAL_HOST || '(default)');
  console.log('[simulator] LAL_MODEL:', env.LAL_MODEL || '(default)');

  const { powers, whenDismissed, sent } = makeMockPowers({
    initialMessage: {
      number: 1,
      from: 'HOST',
      to: 'lal-self-id',
      strings: [
        'Hello from the simulator. Reply with a short greeting, then dismiss this message (dismiss message 1).',
      ],
      names: [],
      ids: [],
    },
  });

  const agent = make(powers, null, { env });

  const done = whenDismissed(1);
  const timeout = new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error(`Simulator timed out after ${TIMEOUT_MS}ms`)),
      TIMEOUT_MS,
    );
  });

  try {
    await Promise.race([done, timeout]);
    console.log('[simulator] Agent dismissed message 1.');
    if (sent.length > 0) {
      console.log('[simulator] Agent sent', sent.length, 'message(s):');
      for (const s of sent) {
        console.log('  ->', s.recipient, ':', s.strings.join(' ').slice(0, 80) + (s.strings.join('').length > 80 ? '...' : ''));
      }
    }
    console.log('[simulator] Done.');
  } catch (err) {
    console.error('[simulator] Error:', err.message);
    process.exitCode = 1;
  }
}

main();
