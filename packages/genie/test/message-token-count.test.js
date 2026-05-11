// @ts-check

/**
 * Tests for getMessageTokenCount — estimated token count of a
 * PiAgent's accumulated message history.
 */

import '@endo/harden';

import test from 'ava';
import { getMessageTokenCount } from '../src/agent/index.js';

/**
 * Build a minimal PiAgent-shaped stub whose `.state.messages` array
 * we control directly.
 *
 * @param {Array<any>} messages
 * @returns {{ state: { messages: Array<any> } }}
 */
const stubAgent = (messages = []) => ({ state: { messages } });

test('returns 0 for an empty message history', t => {
  const agent = stubAgent([]);
  t.is(getMessageTokenCount(/** @type {any} */ (agent)), 0);
});

test('counts a plain-string user message', t => {
  const agent = stubAgent([{ role: 'user', content: 'Hello world!' }]);
  const count = getMessageTokenCount(/** @type {any} */ (agent));
  // "user\nHello world!" = 17 chars → ceil(17/4) = 5
  t.is(count, 5);
});

test('counts an assistant message with text content blocks', t => {
  const agent = stubAgent([
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'Here is the answer.' }],
    },
  ]);
  const count = getMessageTokenCount(/** @type {any} */ (agent));
  // "assistant\nHere is the answer." = 29 chars → ceil(29/4) = 8
  t.is(count, 8);
});

test('counts thinking blocks', t => {
  const agent = stubAgent([
    {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'Let me think about this...' },
        { type: 'text', text: 'Done.' },
      ],
    },
  ]);
  const count = getMessageTokenCount(/** @type {any} */ (agent));
  // "assistant\nLet me think about this...\nDone." = 43 chars → ceil(43/4) = 11
  t.is(count, 11);
});

test('counts toolCall content blocks', t => {
  const agent = stubAgent([
    {
      role: 'assistant',
      content: [
        {
          type: 'toolCall',
          name: 'bash',
          input: { command: 'ls -la' },
        },
      ],
    },
  ]);
  const count = getMessageTokenCount(/** @type {any} */ (agent));
  t.true(count > 0);
});

test('counts toolResult messages with top-level result', t => {
  const agent = stubAgent([
    {
      role: 'toolResult',
      result: 'file1.txt\nfile2.txt',
    },
  ]);
  const count = getMessageTokenCount(/** @type {any} */ (agent));
  t.true(count > 0);
});

test('accumulates across multiple messages', t => {
  const agent = stubAgent([
    { role: 'user', content: 'Hello' },
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'Hi there!' }],
    },
    { role: 'user', content: 'How are you?' },
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'I am fine, thank you.' }],
    },
  ]);
  const count = getMessageTokenCount(/** @type {any} */ (agent));
  // Sum of all individual message token estimates
  t.true(count > 0);
  // Verify it grows with more messages
  const smallAgent = stubAgent([{ role: 'user', content: 'Hello' }]);
  t.true(count > getMessageTokenCount(/** @type {any} */ (smallAgent)));
});

test('returns a number', t => {
  const agent = stubAgent([{ role: 'user', content: 'test' }]);
  t.is(typeof getMessageTokenCount(/** @type {any} */ (agent)), 'number');
});
