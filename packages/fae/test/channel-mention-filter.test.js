// @ts-check
/* eslint-disable no-continue */

/**
 * Unit tests for the reasoning filter and tool call extraction
 * used in the channel mention fallback path.
 *
 * These don't require a running daemon or LLM — they test the
 * pure logic that decides what gets posted to a channel.
 *
 *   npx ava test/channel-mention-filter.test.js
 */

import '@endo/init/debug.js';

import test from 'ava';
import { extractToolCallsFromContent } from '../src/extract-tool-calls.js';

// ---------------------------------------------------------------------------
// extractToolCallsFromContent
// ---------------------------------------------------------------------------

test('extracts JSON tool call from <tool_call> tags', t => {
  const content =
    'Some text <tool_call>{"name":"reply","arguments":{"messageNumber":21,"strings":["Hi"]}}</tool_call> more text';
  const result = extractToolCallsFromContent(content);
  if (!result.toolCalls) return t.fail('expected toolCalls');
  t.is(result.toolCalls.length, 1);
  t.is(result.toolCalls[0].function.name, 'reply');
  t.is(result.toolCalls[0].type, 'function');
  t.is(result.cleanedContent, 'Some text  more text');
});

test('extracts <function=name><parameter=key>value format', t => {
  const content = `<tool_call> <function=reply> <parameter=messageNumber> 21 <parameter>
<parameter=strings>
["Sure thing!"]
<parameter> <function>
</tool_call>`;
  const result = extractToolCallsFromContent(content);
  if (!result.toolCalls) return t.fail('expected toolCalls');
  t.is(result.toolCalls.length, 1);
  t.is(result.toolCalls[0].function.name, 'reply');
  const args = JSON.parse(
    /** @type {string} */ (result.toolCalls[0].function.arguments),
  );
  t.is(args.messageNumber, 21);
  t.deepEqual(args.strings, ['Sure thing!']);
});

test('extracts tool call from inside <think> block', t => {
  const content = `<think> <tool_call> <function=adopt> <parameter=petName> danzone_ref <parameter>
<parameter=messageNumber>
19
<parameter> <parameter=edgeName> danzone <parameter>
<function>
</tool_call>`;
  const result = extractToolCallsFromContent(content);
  if (!result.toolCalls) return t.fail('expected toolCalls');
  t.is(result.toolCalls.length, 1);
  t.is(result.toolCalls[0].function.name, 'adopt');
  const args = JSON.parse(
    /** @type {string} */ (result.toolCalls[0].function.arguments),
  );
  t.is(args.petName, 'danzone_ref');
  t.is(args.messageNumber, 19);
  t.is(args.edgeName, 'danzone');
  // Cleaned content should be empty (all was inside think/tool_call)
  t.is(result.cleanedContent, '');
});

test('tool calls include type: function field', t => {
  const content =
    '<tool_call>{"name":"exec","arguments":{"code":"return 1"}}</tool_call>';
  const result = extractToolCallsFromContent(content);
  if (!result.toolCalls) return t.fail('expected toolCalls');
  t.is(result.toolCalls[0].type, 'function');
});

test('bare <function=name> outside tool_call tags', t => {
  const content =
    'some text <function=reply><parameter=messageNumber>5</parameter></function>';
  const result = extractToolCallsFromContent(content);
  if (!result.toolCalls) return t.fail('expected toolCalls');
  t.is(result.toolCalls[0].function.name, 'reply');
  const args = JSON.parse(
    /** @type {string} */ (result.toolCalls[0].function.arguments),
  );
  t.is(args.messageNumber, 5);
});

test('strips unclosed <think> blocks from cleaned content', t => {
  const content = 'Hello! <think>This is reasoning that never closes';
  const result = extractToolCallsFromContent(content);
  t.is(result.toolCalls, undefined);
  t.is(result.cleanedContent, 'Hello!');
});

test('no tool calls returns undefined', t => {
  const content = 'Just some plain text response';
  const result = extractToolCallsFromContent(content);
  t.is(result.toolCalls, undefined);
  t.is(result.cleanedContent, 'Just some plain text response');
});

// ---------------------------------------------------------------------------
// Reasoning filter (inline logic from agent.js fallback path)
// ---------------------------------------------------------------------------

/**
 * Simulate the reasoning filter from agent.js channel mention fallback.
 * This must stay in sync with the logic in agent.js.
 *
 * @param {string} content
 * @returns {string}
 */
const filterReasoning = content => {
  // Strip residual HTML-like tags
  const cleaned = content.replace(/<\/?think>/g, '').trim();

  const lines = cleaned.split('\n');
  const reasoningRe =
    /^([-•*] (Adopt|Look|Join|Post|Sen[dt]|Return|Perform|Call)|Thus|So |But |However|The (user|instruction|message|content|question|adopt|edge|tool|error)|We (need|should|have|can|could|attempt|perform)|Given |In (previous|earlier|the|that|this)|For (consistency|message|each|the|safety)|Now |Maybe |Possibly|Perhaps|Actually|Let('s|)|Looking|They |That (suggests|means|likely|seems)|This (suggests|means|is)|I('m| think| need| will| should| see|'ve (adopted|joined|posted))|Not sure|After adopt|Proceed|Since |Wait|Hmm|OK |Ok |The (phrase|question|safe)|Step |Recap|All steps|```)/;
  /** @type {string[]} */
  const kept = [];
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    if (!reasoningRe.test(trimmedLine)) {
      kept.push(trimmedLine);
    }
  }
  let result = kept.join('\n').trim();
  if (!result) {
    result = 'Got it! I see the mention. What would you like me to help with?';
  }
  if (result.length > 400) {
    const paragraphs = result.split(/\n\n+/);
    result = paragraphs[paragraphs.length - 1].trim();
  }
  if (result.length > 500) {
    result = `${result.slice(0, 497)}...`;
  }
  return result;
};

test('filters reasoning lines from agent output', t => {
  const agentOutput = `We need to process message #13. The user says:
"reply to that channel"
Thus we need to adopt any referenced values before replying.
The message text is "reply to that channel".
Perhaps we should reply with some text.
Thus we should do a reply tool call.
Sure thing!`;

  const filtered = filterReasoning(agentOutput);
  t.is(filtered, '"reply to that channel"\nSure thing!');
});

test('returns fallback when all content is reasoning', t => {
  const agentOutput = `We need to handle this message.
Thus we should adopt the channel reference.
The instruction says to reply.
Let's proceed with the reply.`;

  const filtered = filterReasoning(agentOutput);
  t.is(
    filtered,
    'Got it! I see the mention. What would you like me to help with?',
  );
});

test('caps long content with hard truncation', t => {
  // When kept lines are joined with \n (not \n\n), paragraph split
  // won't find breaks. The 500-char hard cap catches it.
  const longContent = `First paragraph.\n\n${'x'.repeat(600)}\n\nFinal reply.`;

  const filtered = filterReasoning(longContent);
  t.true(
    filtered.length <= 500,
    `should be <= 500 chars, got ${filtered.length}`,
  );
});

test('takes last paragraph when content has double-newline breaks', t => {
  // Content with \n\n preserved (e.g. non-reasoning multi-paragraph)
  const content =
    'A short intro.\n\nA middle section.\n\nThe actual reply here.';

  const filtered = filterReasoning(content);
  // Under 400 chars, so no truncation
  t.is(filtered, 'A short intro.\nA middle section.\nThe actual reply here.');
});

test('filters recap/log content and <think> tags', t => {
  const recapContent = `- Adopted the @danzone edge from message #67 as petname "danzone_channel".
- Looked up the channel capability.
- Joined the channel as "fae".
- Posted a message to the channel: "Thanks for the mention!"
- Sent a private reply to message #67 with the same text.
- Returned a confirmation.
</think>
I've adopted the channel, joined it, posted a response, and replied to message #67. All steps are complete.`;

  const filtered = filterReasoning(recapContent);
  // </think> should be stripped
  t.false(filtered.includes('</think>'));
  // Bullet-point recap lines should be filtered
  t.false(filtered.includes('Adopted'));
  t.false(filtered.includes('Looked up'));
  // "I've adopted..." line should be filtered by the I've pattern
  t.false(filtered.includes("I've adopted"));
  // "All steps" should be filtered
  t.false(filtered.includes('All steps'));
});

test('preserves clean direct response', t => {
  const clean = "Yes, I'm here! Happy to help with anything you need.";
  const filtered = filterReasoning(clean);
  t.is(filtered, clean);
});
