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

test('invoke forwards the optional invocation context to execute', async t => {
  /** @type {AbortSignal | undefined} */
  let received;
  const tool = makeTool({
    name: 'signal',
    description: 'Observe invocation context.',
    parameters: { type: 'object', properties: {}, required: [] },
    execute: async (_args, context) => {
      received = context?.signal;
      return 'ok';
    },
  });
  const controller = new AbortController();

  await null;
  t.is(await tool.invoke({}, { signal: controller.signal }), 'ok');
  t.is(received, controller.signal);
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

test('invoke maps real property names to positional order', async t => {
  const tool = makeTool({
    name: 'createBranch',
    description: 'Create a branch.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        options: { type: 'object' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    argGuards: [M.string(), M.recordOf(M.string(), M.any())],
    execute: async args => args,
  });

  await null;

  // The named record reaches `execute` unchanged…
  t.deepEqual(await tool.invoke({ name: 'feature' }), { name: 'feature' });
  t.deepEqual(
    await tool.invoke({ name: 'feature', options: { track: true } }),
    {
      name: 'feature',
      options: { track: true },
    },
  );

  // …a value under the wrong (undeclared) key is rejected.
  const wrong = await t.throwsAsync(() => tool.invoke({ branch: 'feature' }));
  t.true(
    wrong !== undefined && wrong.message.includes('branch'),
    `error should name the offending key; got: ${wrong?.message}`,
  );

  // …a missing required key is rejected by its real name.
  const missing = await t.throwsAsync(() =>
    tool.invoke({ options: { track: true } }),
  );
  t.true(
    missing !== undefined && missing.message.includes('name'),
    `error should name the missing required key; got: ${missing?.message}`,
  );

  // …a value of the wrong type under the right name fails its guard, and the
  // guard label names the real property, not a generic `argN`.
  const badType = await t.throwsAsync(() => tool.invoke({ name: 42 }));
  t.true(
    badType !== undefined && badType.message.includes('createBranch name'),
    `guard label should name the real property; got: ${badType?.message}`,
  );
});

test('invoke maps named args to positional and validates each', async t => {
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
