// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import {
  makeCompartmentEvaluate,
} from '../../agent-tools/src/code-mode/compartment.js';
import { makeEvaluateTool } from '../../agent-tools/src/code-mode/evaluate-tool.js';
import { normalizeGlobals } from '../../agent-tools/src/code-mode/declarations.js';
import { makeCodeModeAgent } from '../src/code-mode.js';

/** @import { Model } from '@earendil-works/pi-ai' */

/**
 * @typedef {{ callable: string, keys: PropertyKey[], caught: { same: boolean, message: string }, receiverError: string }} SurfaceResult
 */

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

test('makeCompartmentEvaluate hands the completion value to storeResult under a resultName', async t => {
  /** @type {Array<[unknown, string | string[]]>} */
  const stored = [];
  const evaluate = makeCompartmentEvaluate({
    endowments: { x: 41 },
    storeResult: (value, resultName) => {
      stored.push([value, resultName]);
    },
  });
  const result = await evaluate({
    source: 'x + 1',
    resultName: 'answer',
    globals: [],
  });
  t.is(result, 42);
  t.deepEqual(stored, [[42, 'answer']]);
});

test('makeCompartmentEvaluate returns the value and skips storeResult with no resultName', async t => {
  let stored = false;
  const evaluate = makeCompartmentEvaluate({
    endowments: { x: 1 },
    storeResult: () => {
      stored = true;
    },
  });
  const result = await evaluate({ source: 'x + 1', globals: [] });
  t.is(result, 2);
  t.false(stored);
});

test('makeCompartmentEvaluate rejects a resultName when no storeResult is configured', async t => {
  const evaluate = makeCompartmentEvaluate({ endowments: {} });
  await t.throwsAsync(
    () => evaluate({ source: '1', resultName: 'a', globals: [] }),
    {
      message: /no storeResult callback is configured/,
    },
  );
});

test.serial(
  'makeCompartmentEvaluate contains rejected sends and reports only observed rejections',
  async t => {
    const expected = harden(new Error('guest-visible rejection'));
    const rejector = Far('Rejector', {
      async fail() {
        throw expected;
      },
    });
    let reports = 0;
    let unhandled = 0;
    const onUnhandled = () => {
      unhandled += 1;
    };
    process.on('unhandledRejection', onUnhandled);
    t.teardown(() => process.off('unhandledRejection', onUnhandled));

    const evaluate = makeCompartmentEvaluate({
      endowments: { E, expected, rejector, target: harden({ value: 40 }) },
      onContainedEventualSendRejection: () => {
        reports += 1;
      },
    });
    const result = await evaluate({
      source: `(async () => {
        E(rejector).fail();
        const caught = await E(rejector).fail().catch(error => ({
          same: error === expected,
          message: error.message,
        }));
        return {
          caught,
          property: await E.get(target).value,
          resolved: await E.resolve(42),
          when: await E.when(Promise.resolve(41), value => value + 1),
          sendOnly: E.sendOnly(target).value(),
        };
      })()`,
      globals: [],
    });
    await delay(0);
    await delay(0);

    t.deepEqual(result, {
      caught: { same: true, message: 'guest-visible rejection' },
      property: 40,
      resolved: 42,
      when: 42,
      sendOnly: undefined,
    });
    t.is(reports, 2);
    t.is(unhandled, 0);
  },
);

test.serial(
  'makeCompartmentEvaluate isolates throwing and rejecting reporters',
  async t => {
    const rejector = Far('Rejector', {
      async fail() {
        throw new Error('contained failure');
      },
    });
    let reports = 0;
    let unhandled = 0;
    const onUnhandled = () => {
      unhandled += 1;
    };
    process.on('unhandledRejection', onUnhandled);
    t.teardown(() => process.off('unhandledRejection', onUnhandled));

    const evaluate = makeCompartmentEvaluate({
      endowments: { E, rejector },
      onContainedEventualSendRejection: () => {
        reports += 1;
        if (reports === 1) {
          throw new Error('reporter failure');
        }
        return Promise.reject(new Error('async reporter failure'));
      },
    });
    const result = await evaluate({
      source: `(async () => {
        E(rejector).fail();
        E.get(null).value;
        E.resolve(Promise.reject(new Error('resolved failure')));
        return 'completed';
      })()`,
      globals: [],
    });
    await delay(0);
    await delay(0);

    t.is(result, 'completed');
    t.is(reports, 3);
    t.is(unhandled, 0);
  },
);

test.serial(
  'makeCompartmentEvaluate does not report a plain Promise.reject that never crosses E',
  async t => {
    // The containment wrapper and its reporter only observe values that pass
    // through the tracked E surface (an eventual-send result, E.get, or
    // E.resolve/E.when).
    // A guest promise rejection that never touches E is
    // out of scope by design: it is the guest's own responsibility to handle,
    // and, unlike an E-mediated rejection (see the "contains rejected sends"
    // test above), it never reaches `onContainedEventualSendRejection`, caught
    // or not.
    let reports = 0;
    const evaluate = makeCompartmentEvaluate({
      endowments: { E },
      onContainedEventualSendRejection: () => {
        reports += 1;
      },
    });
    const result = await evaluate({
      source: `(async () => {
        // Caught here so the plain rejection cannot escape as an unhandled
        // rejection; the point under test is that it never reaches the
        // eventual-send reporter, not that it is otherwise unhandled.
        const caught = await Promise.reject(new Error('plain rejection')).catch(
          error => error.message,
        );
        return caught;
      })()`,
      globals: [],
    });
    await delay(0);
    await delay(0);

    t.is(result, 'plain rejection');
    t.is(reports, 0);
  },
);

test('makeCompartmentEvaluate preserves the E surface, rejection identity, and receiver checks', async t => {
  const expected = harden(new Error('identity'));
  const rejector = Far('Rejector', {
    async fail() {
      throw expected;
    },
  });
  const evaluate = makeCompartmentEvaluate({
    endowments: { E, expected, rejector },
  });
  const result = await evaluate({
    source: `(async () => {
      let caught;
      try {
        await E(rejector).fail();
      } catch (error) {
        caught = { same: error === expected, message: error.message };
      }
      const detached = E(rejector).fail;
      let receiverError;
      try {
        await detached();
      } catch (error) {
        receiverError = error.message;
      }
      return {
        callable: typeof E,
        keys: Reflect.ownKeys(E),
        caught,
        receiverError,
      };
    })()`,
    globals: [],
  });
  const surface = /** @type {SurfaceResult} */ (result);

  t.is(surface.callable, 'function');
  t.deepEqual(surface.keys, Reflect.ownKeys(E));
  t.deepEqual(surface.caught, { same: true, message: 'identity' });
  t.regex(surface.receiverError, /Unexpected receiver/);
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

test('normalizeGlobals throws on a duplicate global name rather than silently dropping it', t => {
  // The well-known `git` global is pushed before namedPowers in
  // makeCodeModeGlobals; a namedPower also named `git` would, without this
  // guard, be silently shadowed by the well-known binding at endowment-merge
  // time. Reject the collision so the author learns their power was shadowed.
  t.throws(
    () =>
      normalizeGlobals(
        harden([
          { name: 'git', description: 'well-known git' },
          { name: 'git', description: 'colliding named power' },
        ]),
      ),
    { message: /code-mode global name "git" is declared twice/ },
  );
});

test('normalizeGlobals throws on a global named E (collides with the injected eventual-send)', t => {
  // `E` is always endowed into the code-mode compartment; a global named `E`
  // would be shadowed by the injected binding (spread first) rather than win.
  t.throws(
    () => normalizeGlobals(harden([{ name: 'E', description: 'oops' }])),
    {
      message: /code-mode global name "E" is reserved and cannot be used/,
    },
  );
});

test('makeCodeModeAgent throws when a namedPower collides with the well-known git binding', t => {
  // End-to-end: a configured git power plus a namedPower named `git` must be
  // rejected at agent-construction time, not silently resolve to the
  // well-known git capability.
  t.throws(
    () =>
      makeCodeModeAgent({
        model: fauxModel,
        powers: {
          git: Far('G', {}),
          namedPowers: [{ name: 'git', petName: 'other', description: 'h' }],
        },
      }),
    { message: /code-mode global name "git" is declared twice/ },
  );
});

test('makeEvaluateTool.invoke forwards validated args plus normalized globals', async t => {
  /** @type {any} */
  let captured;
  const tool = makeEvaluateTool(
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
  const { agent, globals, evaluate, systemPrompt, model } = makeCodeModeAgent({
    model: fauxModel,
    lookupPowers,
    powers: {
      namedPowers: [
        { name: 'helper', petName: 'helper-cap', description: 'h' },
      ],
    },
  });
  t.is(model, fauxModel);
  t.is(typeof evaluate, 'function');
  t.true(systemPrompt.includes('declare const helper;'));
  t.deepEqual(
    globals.map(global => global.name),
    ['helper'],
  );
  t.deepEqual(
    agent.state.tools.map(tool => tool.name),
    ['evaluate'],
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

test('makeCodeModeAgent uses a supplied evaluate and lexical endowments end to end', async t => {
  const { evaluate } = makeCodeModeAgent({
    model: fauxModel,
    endowments: { tally: 10 },
    powers: { namedPowers: [] },
  });
  // The default compartment evaluate runs the source against the endowments.
  const result = await evaluate({ source: 'tally * 2', globals: [] });
  t.is(result, 20);
  // E is always endowed.
  t.is(typeof E, 'function');
});

test('makeCodeModeAgent rejects a custom evaluate paired with onContainedEventualSendRejection', t => {
  // A custom evaluate bypasses makeCompartmentEvaluate, so the reporter would
  // silently never fire; fail fast instead of accepting dead configuration.
  t.throws(
    () =>
      makeCodeModeAgent({
        model: fauxModel,
        evaluate: async () => 'unused',
        onContainedEventualSendRejection: () => {},
      }),
    {
      message:
        /onContainedEventualSendRejection has no effect with a custom evaluate/,
    },
  );
});

test('makeCompartmentEvaluate preserves the wrapped operation name and length on tracked E', async t => {
  const rejector = Far('Rejector', {
    async fail(_a, _b) {
      return 'ok';
    },
  });
  const evaluate = makeCompartmentEvaluate({
    endowments: { E, rejector },
    onContainedEventualSendRejection: () => {},
  });
  const result = await evaluate({
    source: `(() => ({
      methodName: E(rejector).fail.name,
      methodLength: E(rejector).fail.length,
      resolveName: E.resolve.name,
      whenName: E.when.name,
      sendOnlyName: E.sendOnly.name,
      getName: E.get.name,
    }))()`,
    globals: [],
  });
  t.deepEqual(result, {
    methodName: 'fail',
    methodLength: 0,
    resolveName: E.resolve.name,
    whenName: E.when.name,
    sendOnlyName: E.sendOnly.name,
    getName: E.get.name,
  });
});
