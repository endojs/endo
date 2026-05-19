// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';
import fs from 'node:fs';
import url from 'node:url';

import { spawnWorkerLoop } from '../agent.js';
import { findMockTrace, makeMockProvider } from '../providers/index.js';
import { makeMockPowers } from '../tools/mock-powers.js';

const fixturePath = url.fileURLToPath(
  new URL('fixtures/llm-provider-traces.json', import.meta.url),
);

const loadFixtures = () => JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

/**
 * Derive the ordered list of tool names actually invoked across all
 * rounds of a fixture trace. Used to check that the static
 * `expectedToolNames` declaration stays in sync with the trace data.
 *
 * @param {ReturnType<typeof findMockTrace>} trace
 * @returns {string[]}
 */
const actualToolCallNames = trace =>
  (trace.rounds || []).flatMap(round => {
    const toolCalls =
      /** @type {{ function: { name: string } }[]} */ (
        /** @type {any} */ (round.response.message).tool_calls
      ) || [];
    return toolCalls.map(call => call.function.name);
  });

test('mock provider fixture replays Lal inbox reply and dismiss flow', async t => {
  const trace = findMockTrace(loadFixtures(), 'lal.current.inbox-reply');
  t.deepEqual(
    actualToolCallNames(trace),
    trace.expectedToolNames,
    'fixture rounds should invoke exactly the declared expectedToolNames',
  );

  const { powers, whenDismissed, sent } = makeMockPowers({
    initialMessage: harden({
      number: 1,
      from: '@host',
      to: 'lal-self-id',
      messageId: 'mock-msg-1',
      strings: [
        'Reply with exactly: OK then dismiss this message (dismiss message 1).',
      ],
      names: [],
      ids: [],
    }),
  });

  const dismissed = whenDismissed(1);
  await spawnWorkerLoop(powers, null, {
    provider: makeMockProvider({ trace }),
  });
  await dismissed;

  const reply = sent.find(record =>
    record.strings.some(text => text.includes('OK')),
  );
  t.truthy(reply, 'fixture should drive Lal to reply with OK');
  t.true(
    reply?.strings[0].startsWith('[depth:'),
    'Lal reply tool should still add transcript depth',
  );
});
