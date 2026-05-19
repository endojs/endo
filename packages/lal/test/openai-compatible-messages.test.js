import test from '@endo/ses-ava/prepare-endo.js';

import { toOpenAICompatibleMessages } from '../providers/openai-compatible-messages.js';

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
