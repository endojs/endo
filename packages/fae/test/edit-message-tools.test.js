// @ts-check
/**
 * Unit tests for the editMessage and messageHistory tool makers
 * added to the fae agent surface in response to the daemon
 * editMessage / messageHistory capability.
 *
 * These tests stub the powers handle and verify that:
 *   - the tool schema advertises the documented parameters,
 *   - execute() forwards the call through to the powers handle
 *     with the expected shape (BigInt message numbers, harden'd
 *     options record).
 */

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/far';

import {
  makeEditMessageTool,
  makeMessageHistoryTool,
} from '../src/tool-makers.js';

/**
 * @typedef {object} Call
 * @property {string} method
 * @property {unknown[]} args
 */

/**
 * Build a stub powers object that records every method invocation.
 * Each call resolves to whatever the optional return map specifies,
 * defaulting to `undefined`.
 *
 * @param {Record<string, unknown>} [returns]
 */
const makeStubPowers = (returns = {}) => {
  /** @type {Call[]} */
  const calls = [];
  const stub = Far('StubPowers', {
    /**
     * @param {bigint} messageNumber
     * @param {string[]} strings
     * @param {string[]} edgeNames
     * @param {Array<string | string[]>} petNames
     * @param {{ done?: boolean } | undefined} [options]
     */
    editMessage(messageNumber, strings, edgeNames, petNames, options) {
      calls.push({
        method: 'editMessage',
        args: [messageNumber, strings, edgeNames, petNames, options],
      });
      return /** @type {Promise<void>} */ (
        Promise.resolve(/** @type {any} */ (returns.editMessage))
      );
    },
    /**
     * @param {bigint} messageNumber
     */
    messageHistory(messageNumber) {
      calls.push({ method: 'messageHistory', args: [messageNumber] });
      return Promise.resolve(returns.messageHistory ?? []);
    },
  });
  return { stub, calls };
};

test('editMessage tool: schema advertises the documented parameters', t => {
  const { stub } = makeStubPowers();
  const tool = makeEditMessageTool(stub);
  const schema = tool.schema();
  t.is(schema.type, 'function');
  t.is(schema.function.name, 'editMessage');
  const params = /** @type {any} */ (schema.function.parameters);
  t.deepEqual(Object.keys(params.properties).sort(), [
    'done',
    'edgeNames',
    'messageNumber',
    'petNames',
    'strings',
  ]);
  t.deepEqual(params.required, ['messageNumber', 'strings']);
});

test('editMessage tool: forwards to powers with BigInt and options', async t => {
  const { stub, calls } = makeStubPowers();
  const tool = makeEditMessageTool(stub);
  const result = await tool.execute({
    messageNumber: 7,
    strings: ['Final answer.'],
    edgeNames: [],
    petNames: [],
    done: true,
  });
  t.is(calls.length, 1);
  t.is(calls[0].method, 'editMessage');
  t.is(calls[0].args[0], 7n);
  t.deepEqual(calls[0].args[1], ['Final answer.']);
  t.deepEqual(calls[0].args[2], []);
  t.deepEqual(calls[0].args[3], []);
  t.deepEqual(calls[0].args[4], { done: true });
  t.is(result, 'Edited message #7');
});

test('editMessage tool: omits options when done is undefined', async t => {
  const { stub, calls } = makeStubPowers();
  const tool = makeEditMessageTool(stub);
  await tool.execute({
    messageNumber: 3,
    strings: ['Hello'],
    edgeNames: [],
    petNames: [],
  });
  t.is(calls.length, 1);
  t.is(calls[0].args[4], undefined);
});

test('editMessage tool: marks partial submissions in the result text', async t => {
  const { stub } = makeStubPowers();
  const tool = makeEditMessageTool(stub);
  const result = await tool.execute({
    messageNumber: 9,
    strings: ['Thinking...'],
    edgeNames: [],
    petNames: [],
    done: false,
  });
  t.is(result, 'Edited message #9 (partial)');
});

test('editMessage tool: requires messageNumber', async t => {
  const { stub } = makeStubPowers();
  const tool = makeEditMessageTool(stub);
  await t.throwsAsync(
    () =>
      tool.execute({
        strings: ['Hello'],
        edgeNames: [],
        petNames: [],
      }),
    { message: /messageNumber is required/ },
  );
});

test('messageHistory tool: schema advertises the documented parameters', t => {
  const { stub } = makeStubPowers();
  const tool = makeMessageHistoryTool(stub);
  const schema = tool.schema();
  t.is(schema.type, 'function');
  t.is(schema.function.name, 'messageHistory');
  const params = /** @type {any} */ (schema.function.parameters);
  t.deepEqual(Object.keys(params.properties), ['messageNumber']);
  t.deepEqual(params.required, ['messageNumber']);
});

test('messageHistory tool: forwards to powers with BigInt and returns the result', async t => {
  const revisions = harden([
    { envelope: { strings: ['draft'] }, done: false, date: 'a', timestamp: 1 },
    { envelope: { strings: ['final'] }, done: true, date: 'b', timestamp: 2 },
  ]);
  const { stub, calls } = makeStubPowers({ messageHistory: revisions });
  const tool = makeMessageHistoryTool(stub);
  const result = await tool.execute({ messageNumber: 12 });
  t.is(calls.length, 1);
  t.is(calls[0].method, 'messageHistory');
  t.is(calls[0].args[0], 12n);
  t.is(result, revisions);
});

test('messageHistory tool: requires messageNumber', async t => {
  const { stub } = makeStubPowers();
  const tool = makeMessageHistoryTool(stub);
  await t.throwsAsync(() => tool.execute({}), {
    message: /messageNumber is required/,
  });
});
