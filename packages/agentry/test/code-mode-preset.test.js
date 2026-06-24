// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';
import { E, Far } from '@endo/far';

import {
  makeCompartmentExecute,
  makeExecuteTool,
  normalizeGlobals,
  makeCodeModeAgent,
} from '../src/execute/index.js';

/** @import { Model } from '@earendil-works/pi-ai' */

/**
 * A concrete, inert pi-ai `Model` good enough to construct an agent without
 * touching the network.
 *
 * @type {Model<string>}
 */
const fauxModel = harden({
  id: 'm',
  name: 'faux/m',
  api: 'openai-completions',
  provider: 'openai',
  baseUrl: 'http://invalid.example',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 4096,
  maxTokens: 1024,
});

test('makeCompartmentExecute hands the completion value to storeResult under a resultName', async t => {
  /** @type {Array<[unknown, string | string[]]>} */
  const stored = [];
  const execute = makeCompartmentExecute({
    endowments: { x: 41 },
    storeResult: (value, resultName) => {
      stored.push([value, resultName]);
    },
  });
  const result = await execute({
    source: 'x + 1',
    resultName: 'answer',
    globals: [],
  });
  t.is(result, 42);
  t.deepEqual(stored, [[42, 'answer']]);
});

test('makeCompartmentExecute returns the value and skips storeResult with no resultName', async t => {
  let stored = false;
  const execute = makeCompartmentExecute({
    endowments: { x: 1 },
    storeResult: () => {
      stored = true;
    },
  });
  const result = await execute({ source: 'x + 1', globals: [] });
  t.is(result, 2);
  t.false(stored);
});

test('makeCompartmentExecute rejects a resultName when no storeResult is configured', async t => {
  const execute = makeCompartmentExecute({ endowments: {} });
  await t.throwsAsync(
    () => execute({ source: '1', resultName: 'a', globals: [] }),
    {
      message: /no storeResult callback is configured/,
    },
  );
});

test('normalizeGlobals rejects a non-identifier global name', t => {
  t.throws(() => normalizeGlobals(harden([{ name: '1bad' }])), {
    message: /code-mode global name must be a JS identifier: 1bad/,
  });
});

test('normalizeGlobals rejects an invalid petName', t => {
  t.throws(
    () =>
      normalizeGlobals(
        harden([{ name: 'ok', petName: /** @type {any} */ (123) }]),
      ),
    { message: /code-mode global "ok" has invalid petName/ },
  );
});

test('normalizeGlobals defaults petName to name and accepts a petName path', t => {
  const normalized = normalizeGlobals(
    harden([{ name: 'a' }, { name: 'b', petName: ['x', 'y'] }]),
  );
  t.is(normalized[0].petName, 'a');
  t.deepEqual(normalized[1].petName, ['x', 'y']);
});

test('makeExecuteTool.invoke forwards validated args plus normalized globals', async t => {
  /** @type {any} */
  let captured;
  const tool = makeExecuteTool(
    async input => {
      captured = input;
      return 'k';
    },
    harden([{ name: 'git', description: 'g' }]),
  );
  const out = await tool.invoke({ source: 'src', resultName: ['a', 'b'] });
  t.is(out, 'k');
  t.is(captured.source, 'src');
  t.deepEqual(captured.resultName, ['a', 'b']);
  t.deepEqual(captured.globals, [
    { name: 'git', petName: 'git', description: 'g' },
  ]);

  // A bare source forwards an undefined resultName.
  await tool.invoke({ source: 'src2' });
  t.is(captured.resultName, undefined);
});

test('makeCodeModeAgent rejects a powers lookup name that is not a JS identifier', t => {
  t.throws(
    () =>
      makeCodeModeAgent({
        model: fauxModel,
        powers: { git: Far('G', {}), gitPetName: 'not an id' },
      }),
    {
      message:
        /code-mode git petName must be a single JS identifier to use as a lexical binding/,
    },
  );
});

test('makeCodeModeAgent requires a lookup powers handle when a capability is named but not passed inline', t => {
  // gitPetName names a git power, but neither `git` nor `lookupPowers` is
  // supplied, so the required-power lookup has nothing to resolve against.
  t.throws(
    () =>
      makeCodeModeAgent({
        model: fauxModel,
        powers: { gitPetName: 'git' },
      }),
    { message: /code-mode git capability requires powers/ },
  );
});

test('makeCodeModeAgent resolves named powers through a live lookup handle', t => {
  const looked = [];
  const fakeCap = Far('Cap', {});
  const lookupPowers = Far('Powers', {
    async lookup(petName) {
      looked.push(petName);
      return fakeCap;
    },
  });
  const { agent, globals, execute, systemPrompt, model } = makeCodeModeAgent({
    model: fauxModel,
    lookupPowers,
    powers: {
      namedPowers: [
        { name: 'helper', petName: 'helper-cap', description: 'h' },
      ],
    },
  });
  t.is(model, fauxModel);
  t.is(typeof execute, 'function');
  t.true(systemPrompt.includes('declare const helper;'));
  t.deepEqual(
    globals.map(global => global.name),
    ['helper'],
  );
  t.deepEqual(
    agent.state.tools.map(tool => tool.name),
    ['execute'],
  );
});

test('makeCodeModeAgent honors an explicit globals list and preamble override', t => {
  const { systemPrompt, globals } = makeCodeModeAgent({
    model: fauxModel,
    globals: harden([{ name: 'thing', description: 'a thing' }]),
    preamble: 'CUSTOM PREAMBLE.',
  });
  t.true(systemPrompt.startsWith('CUSTOM PREAMBLE.'));
  t.true(systemPrompt.includes('declare const thing;'));
  t.deepEqual(
    globals.map(global => global.name),
    ['thing'],
  );
});

test('makeCodeModeAgent uses a supplied execute and lexical endowments end to end', async t => {
  const { execute } = makeCodeModeAgent({
    model: fauxModel,
    endowments: { tally: 10 },
    powers: { namedPowers: [] },
  });
  // The default compartment execute runs the source against the endowments.
  const result = await execute({ source: 'tally * 2', globals: [] });
  t.is(result, 20);
  // E is always endowed.
  t.is(typeof E, 'function');
});
