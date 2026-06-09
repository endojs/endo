// @ts-check

// Establish a SES perimeter (provides the `harden` global).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import { M } from '@endo/patterns';

import { makeTool } from '../src/tool.js';

test('makeTool produces the advertised record shape', t => {
  const parameters = {
    type: 'object',
    properties: { arg0: { type: 'string' } },
    required: ['arg0'],
    additionalProperties: false,
  };
  const tool = makeTool({
    name: 'echo',
    description: 'Echo its argument back.',
    parameters,
    execute: async ({ arg0 }) => arg0,
  });

  t.is(tool.name, 'echo');
  t.is(tool.description, 'Echo its argument back.');
  t.is(tool.inputSchema, tool.parameters);
  t.is(typeof tool.invoke, 'function');
  t.truthy(Object.isFrozen(tool));
  t.truthy(Object.isFrozen(parameters));
  t.truthy(Object.isFrozen(parameters.properties));
});

test('invoke runs execute when no argGuards are supplied', async t => {
  const tool = makeTool({
    name: 'echo',
    description: 'Echo.',
    parameters: { type: 'object', properties: {}, required: [] },
    execute: async ({ arg0 }) => `got:${arg0}`,
  });
  await null;
  t.is(await tool.invoke({ arg0: 'hi' }), 'got:hi');
});

test('invoke enforces argGuards before execute', async t => {
  let ran = false;
  const tool = makeTool({
    name: 'strlen',
    description: 'Length of a string.',
    parameters: {
      type: 'object',
      properties: { arg0: { type: 'string' } },
      required: ['arg0'],
      additionalProperties: false,
    },
    argGuards: [M.string()],
    execute: async ({ arg0 }) => {
      ran = true;
      return /** @type {string} */ (arg0).length;
    },
  });

  await null;
  t.is(await tool.invoke({ arg0: 'abcd' }), 4);
  t.true(ran);

  ran = false;
  await t.throwsAsync(() => tool.invoke({ arg0: 42 }));
  t.false(ran);
});

test('invoke rejects missing required guarded args before execute', async t => {
  let ran = false;
  const tool = makeTool({
    name: 'commit',
    description: 'Commit.',
    parameters: {
      type: 'object',
      properties: { arg0: { type: 'string' } },
      required: ['arg0'],
      additionalProperties: false,
    },
    argGuards: [M.string()],
    execute: async ({ arg0 }) => {
      ran = true;
      return arg0;
    },
  });

  await null;
  const err = await t.throwsAsync(() => tool.invoke({}));
  t.true(
    err !== undefined && err.message.includes('arg0'),
    `error message should name the missing key; got: ${err?.message}`,
  );
  t.false(ran);
});

test('invoke rejects unknown argN keys', async t => {
  const tool = makeTool({
    name: 'strlen',
    description: 'Length of a string.',
    parameters: {
      type: 'object',
      properties: { arg0: { type: 'string' } },
      required: ['arg0'],
      additionalProperties: false,
    },
    argGuards: [M.string()],
    execute: async ({ arg0 }) => /** @type {string} */ (arg0).length,
  });

  await null;
  const err = await t.throwsAsync(() =>
    tool.invoke({ arg0: 'hello', argZZ: 'extra' }),
  );
  t.true(
    err !== undefined && err.message.includes('argZZ'),
    `error message should name the offending key; got: ${err?.message}`,
  );

  t.is(await tool.invoke({ arg0: 'hello' }), 5);
});

test('invoke marshals named args to positional and validates each', async t => {
  const tool = makeTool({
    name: 'pair',
    description: 'Two args.',
    parameters: {
      type: 'object',
      properties: { arg0: { type: 'string' }, arg1: { type: 'object' } },
      required: ['arg0'],
      additionalProperties: false,
    },
    argGuards: [M.string(), M.recordOf(M.string(), M.any())],
    execute: async ({ arg0, arg1 }) => ({ arg0, arg1 }),
  });

  await null;
  t.deepEqual(await tool.invoke({ arg0: 'x' }), { arg0: 'x', arg1: undefined });

  t.deepEqual(await tool.invoke({ arg0: 'x', arg1: { k: 1 } }), {
    arg0: 'x',
    arg1: { k: 1 },
  });

  await t.throwsAsync(() => tool.invoke({ arg0: 'x', arg1: 'not-a-record' }));
});
