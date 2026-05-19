import test from '@endo/ses-ava/prepare-endo.js';
import fs from 'node:fs';
import url from 'node:url';

import { findMockTrace } from '../providers/index.js';
import { toOpenAICompatibleMessages } from '../providers/openai-compatible-messages.js';

const fixturePath = url.fileURLToPath(
  new URL('fixtures/llm-provider-traces.json', import.meta.url),
);

const loadFixtures = () => JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

test('OpenAI-compatible history preserves tool call type', t => {
  const messages = toOpenAICompatibleMessages([
    { role: 'user', content: 'What tools do you have?' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call_123',
          function: {
            name: 'reply',
            arguments: { messageNumber: 1, strings: ['hello'] },
          },
        },
      ],
    },
    {
      role: 'tool',
      content: '"Replied"',
      tool_call_id: 'call_123',
    },
  ]);

  t.deepEqual(messages, [
    { role: 'user', content: 'What tools do you have?' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'reply',
            arguments: '{"messageNumber":1,"strings":["hello"]}',
          },
        },
      ],
    },
    {
      role: 'tool',
      content: '"Replied"',
      tool_call_id: 'call_123',
    },
  ]);
});

test('fixture documents provider rejection before tool-call type normalization', t => {
  const fixtures = loadFixtures();
  const before = findMockTrace(
    fixtures,
    'lal.llm-tip.openai-compatible-missing-type',
  );
  const after = findMockTrace(
    fixtures,
    'lal.current.openai-compatible-with-type',
  );
  const beforeProviderResult = before.providerResult;
  const afterProviderResult = after.providerResult;
  const beforeProviderRequest = before.providerRequest;
  const afterProviderRequest = after.providerRequest;

  if (
    beforeProviderResult === undefined ||
    afterProviderResult === undefined ||
    beforeProviderRequest === undefined ||
    afterProviderRequest === undefined
  ) {
    throw new Error('fixture is missing provider request/result data');
  }

  t.is(beforeProviderResult.ok, false);
  t.is(beforeProviderResult.status, 400);
  t.is(afterProviderResult.ok, true);

  const normalized = toOpenAICompatibleMessages(beforeProviderRequest.messages);
  t.deepEqual(
    normalized,
    afterProviderRequest.messages,
    'current Lal provider history matches the accepted provider-facing fixture',
  );
});
