// @ts-check

// Establish a SES perimeter (provides the `harden` global).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';

import { makeTool } from '../src/tool.js';
import { toPiAgentTool } from '../src/pi.js';

/**
 * @param {unknown} result
 * @returns {import('../src/types.js').ToolRecord}
 */
const toolReturning = result =>
  makeTool({
    name: 'echo',
    description: 'Echo a fixed result.',
    parameters: harden({
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    }),
    execute: async () => result,
  });

test('toPiAgentTool copies the model-facing surface verbatim', t => {
  const tool = toolReturning('ok');
  const agentTool = toPiAgentTool(tool);
  t.is(agentTool.name, 'echo');
  t.is(agentTool.label, 'echo');
  t.is(agentTool.description, 'Echo a fixed result.');
  t.is(agentTool.parameters, tool.parameters);
});

test('default render passes strings through and JSON-stringifies the rest', async t => {
  const stringTool = toPiAgentTool(toolReturning('plain text'));
  const stringResult = await stringTool.execute('id-1', {});
  t.deepEqual(stringResult.content, [{ type: 'text', text: 'plain text' }]);
  t.is(stringResult.details, 'plain text');

  const objectTool = toPiAgentTool(toolReturning(harden({ a: 1 })));
  const objectResult = await objectTool.execute('id-2', {});
  t.deepEqual(objectResult.content, [{ type: 'text', text: '{"a":1}' }]);
});

test('the renderToolResult hook controls the rendered text', async t => {
  const seen = [];
  const tool = toPiAgentTool(toolReturning(harden({ value: 42 })), {
    renderToolResult: result => {
      seen.push(result);
      return 'RENDERED';
    },
  });
  const result = await tool.execute('id-3', {});
  t.deepEqual(result.content, [{ type: 'text', text: 'RENDERED' }]);
  // The raw value is retained as structured details for non-text consumers.
  t.deepEqual(result.details, { value: 42 });
  t.deepEqual(seen, [{ value: 42 }]);
});
