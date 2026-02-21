// @ts-check
/* global process, setTimeout */
/**
 * Ava test that runs the Lal agent simulator with mock powers and real env.
 * Use to debug LLM providers (Anthropic, OpenAI, llama.cpp) without a daemon.
 *
 * Run with env vars set, e.g.:
 *   LAL_HOST=https://api.anthropic.com LAL_AUTH_TOKEN=sk-... yarn test test/simulator/run-simulator.test.js
 *   source openai.env.example && yarn test test/simulator/run-simulator.test.js
 */

import test from '@endo/ses-ava/prepare-endo.js';
import { makeMockPowers } from './mock-powers.js';

const TIMEOUT_MS = 120_000;

test('simulator: agent processes one message with real provider (env)', async t => {
  const env = process.env;
  const host = env.LAL_HOST;
  if (!host) {
    t.log('LAL_HOST not set; skipping simulator test');
    t.pass();
    return;
  }

  const isAnthropic = host.includes('anthropic.com');
  if (isAnthropic && !env.LAL_AUTH_TOKEN) {
    t.log('LAL_AUTH_TOKEN not set; skipping simulator test');
    t.pass();
    return;
  }

  const { make } = await import('../../agent.js');

  const { powers, whenDismissed, sent } = makeMockPowers({
    initialMessage: {
      number: 1,
      from: 'HOST',
      to: 'lal-self-id',
      strings: [
        'Reply with exactly: OK then dismiss this message (dismiss message 1).',
      ],
      names: [],
      ids: [],
    },
  });

  const agent = make(powers, null, { env });
  t.truthy(agent, 'agent created');

  const done = whenDismissed(1);
  const timeout = new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error(`Simulator timed out after ${TIMEOUT_MS}ms`)),
      TIMEOUT_MS,
    );
  });

  await t.notThrowsAsync(Promise.race([done, timeout]));
  t.true(sent.length >= 1, 'agent sent at least one message (ready + reply)');
});
