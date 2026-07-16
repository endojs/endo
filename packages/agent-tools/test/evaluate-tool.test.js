// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';

import { makeCompartmentEvaluate } from '../src/code-mode/compartment.js';
import { makeEvaluateTool } from '../src/code-mode/evaluate-tool.js';

test('evaluate omits resultName without a store and does not throw', async t => {
  const evaluate = makeCompartmentEvaluate({ endowments: { answer: 41 } });
  const tool = makeEvaluateTool(evaluate, []);
  const properties = /** @type {{ properties: Record<string, unknown> }} */ (
    tool.parameters
  ).properties;

  t.deepEqual(Object.keys(properties), ['source']);
  t.is(await tool.invoke({ source: 'answer + 1' }), 42);
});

test('evaluate stores and retrieves a completion through an in-memory map', async t => {
  const values = new Map();
  const storeValue = async (valueOrPromise, nameOrPath) => {
    values.set(
      Array.isArray(nameOrPath) ? nameOrPath.join('/') : nameOrPath,
      await valueOrPromise,
    );
  };
  const evaluate = makeCompartmentEvaluate({
    endowments: { answer: 41 },
    storeValue,
  });
  const tool = makeEvaluateTool(evaluate, [], storeValue);
  const properties = /** @type {{ properties: Record<string, unknown> }} */ (
    tool.parameters
  ).properties;

  t.true(Object.hasOwn(properties, 'resultName'));
  t.is(
    await tool.invoke({ source: 'answer + 1', resultName: ['answers', 'one'] }),
    42,
  );
  t.is(values.get('answers/one'), 42);
});

test('evaluate rejects a hidden resultName argument without store authority', async t => {
  const evaluate = makeCompartmentEvaluate({ endowments: {} });
  const tool = makeEvaluateTool(evaluate, []);

  await t.throwsAsync(
    () => tool.invoke({ source: '1', resultName: 'answer' }),
    { message: /without storeValue/ },
  );
});
