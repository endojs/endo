// @ts-check
/* global process */

// Establish a perimeter:
import '@endo/init/debug.js';

import baseTest from 'ava';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';

import { netListenAllowed } from './_net-permission.js';
import {
  start,
  stop,
  restart,
  purge,
  makeEndoClient,
} from '../index.js';
import { parseId } from '../src/formula-identifier.js';

const test = netListenAllowed ? baseTest : baseTest.skip;

const makeConfig = root => ({
  statePath: path.join(root, 'state'),
  ephemeralStatePath: path.join(root, 'run'),
  cachePath: path.join(root, 'cache'),
  sockPath:
    process.platform === 'win32'
      ? `\\\\?\\pipe\\endo-${path.basename(root)}.sock`
      : path.join(root, 'endo.sock'),
  pets: new Map(),
  values: new Map(),
});

/**
 * @param {ReturnType<typeof makeConfig>} config
 * @param {Promise<void>} cancelled
 */
const makeHost = async (config, cancelled) => {
  const { getBootstrap } = await makeEndoClient(
    'client',
    config.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  return E(bootstrap).host();
};

/**
 * @param {ReturnType<typeof makeConfig>} config
 * @param {string} id
 */
const readFormulaById = async (config, id) => {
  const { number } = parseId(id);
  const formulaPath = path.join(
    config.statePath,
    'formulas',
    number.slice(0, 2),
    `${number.slice(2)}.json`,
  );
  const formulaText = await fs.readFile(formulaPath, 'utf-8');
  return JSON.parse(formulaText);
};

/** @param {import('ava').ExecutionContext<any>} t */
const prepareConfig = async t => {
  const rootPath = await fs.mkdtemp(
    path.join(os.tmpdir(), 'endo-xsnap-boundary-'),
  );
  const config = makeConfig(rootPath);
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  await purge(config);
  await start(config);
  t.context.push({ rootPath, config, cancel, cancelled });
  return { rootPath, config, cancel, cancelled };
};

baseTest.beforeEach(t => {
  t.context = [];
});

baseTest.afterEach.always(async t => {
  /** @type {Array<{rootPath: string, config: ReturnType<typeof makeConfig>, cancel: (reason: Error) => void, cancelled: Promise<never>}>} */
  const contexts = /** @type {any} */ (t.context);
  await Promise.allSettled(
    contexts.flatMap(({ rootPath, config, cancel, cancelled }) => {
      cancel(Error('teardown'));
      return [cancelled, stop(config), fs.rm(rootPath, { recursive: true })];
    }),
  );
});

test('marshal formula persists smallcaps body and formula slot', async t => {
  const { config, cancelled } = await prepareConfig(t);
  const host = await makeHost(config, cancelled);

  await E(host).provideWorker(['w1']);
  const counter = await E(host).evaluate(
    'w1',
    `
      (() => {
        let value = 0;
        return makeExo(
          'Counter',
          M.interface('Counter', {}, { defaultGuards: 'passable' }),
          { incr: () => value += 1 }
        );
      })()
    `,
    [],
    [],
    ['counter'],
  );

  await E(host).storeValue(counter, 'counter-copy');
  const counterId = await E(host).identify('counter');
  const counterCopyId = await E(host).identify('counter-copy');
  t.truthy(counterId);
  t.truthy(counterCopyId);

  const formula = await readFormulaById(config, counterCopyId);
  t.is(formula.type, 'marshal');
  t.true(typeof formula.body === 'string' && formula.body.startsWith('#'));
  t.deepEqual(formula.slots, [counterId]);
});

test('cross-worker reference keeps formula id across restart', async t => {
  const { config, cancelled } = await prepareConfig(t);

  {
    const host = await makeHost(config, cancelled);
    await E(host).provideWorker(['w1']);
    await E(host).provideWorker(['w2']);
    await E(host).evaluate(
      'w1',
      `
        (() => {
          let value = 0;
          return makeExo(
            'Counter',
            M.interface('Counter', {}, { defaultGuards: 'passable' }),
            { incr: () => value += 1 }
          );
        })()
      `,
      [],
      [],
      ['counter'],
    );
    t.is(await E(host).evaluate('w2', 'E(counter).incr()', ['counter'], ['counter']), 1);
    t.is(await E(host).evaluate('w2', 'E(counter).incr()', ['counter'], ['counter']), 2);
  }

  const hostBeforeRestart = await makeHost(config, cancelled);
  const counterIdBefore = await E(hostBeforeRestart).identify('counter');

  await restart(config);

  const hostAfterRestart = await makeHost(config, cancelled);
  const counterIdAfter = await E(hostAfterRestart).identify('counter');

  t.is(counterIdAfter, counterIdBefore);
  t.is(
    await E(hostAfterRestart).evaluate(
      'w2',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
    1,
  );
  t.is(
    await E(hostAfterRestart).evaluate(
      'w2',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
    2,
  );
});

test('host makeXsnapRef forwards with formula-like ergonomics across restart', async t => {
  const { config, cancelled } = await prepareConfig(t);

  {
    const host = await makeHost(config, cancelled);
    await E(host).provideWorker(['w1']);
    await E(host).provideWorker(['w2']);
    await E(host).evaluate(
      'w1',
      `
        (() => {
          let value = 0;
          return makeExo(
            'Counter',
            M.interface('Counter', {}, { defaultGuards: 'passable' }),
            { incr: () => value += 1 }
          );
        })()
      `,
      [],
      [],
      ['counter'],
    );
    await E(host).makeXsnapRef('xsw', 'counter', 'counter-facade');
    t.is(
      await E(host).evaluate(
        'w2',
        'E(facade).incr()',
        ['facade'],
        ['counter-facade'],
      ),
      1,
    );
    t.is(
      await E(host).evaluate(
        'w2',
        'E(facade).incr()',
        ['facade'],
        ['counter-facade'],
      ),
      2,
    );
  }

  await restart(config);

  {
    const host = await makeHost(config, cancelled);
    const facadeId = await E(host).identify('counter-facade');
    t.truthy(facadeId);
    const facadeFormula = await readFormulaById(config, facadeId);
    t.is(facadeFormula.type, 'xsnap-ref');
    const selfId = await E(host).identify('SELF');
    t.truthy(selfId);
    const { node: selfNode } = parseId(selfId);
    const { node: facadeHubNode } = parseId(facadeFormula.hub);
    t.is(facadeHubNode, selfNode);
    t.deepEqual(facadeFormula.path, ['counter']);
    t.is(facadeFormula.worker, await E(host).identify('xsw'));
    t.is(
      await E(host).evaluate(
        'w2',
        'E(facade).incr()',
        ['facade'],
        ['counter-facade'],
      ),
      1,
    );
  }
});

test('xsnap ref requires xsnap worker formula', async t => {
  const { config, cancelled } = await prepareConfig(t);
  const host = await makeHost(config, cancelled);
  await E(host).provideWorker(['w1']);
  await E(host).provideWorker(['w2']);
  await E(host).evaluate(
    'w1',
    `
      (() => {
        let value = 0;
        return makeExo(
          'Counter',
          M.interface('Counter', {}, { defaultGuards: 'passable' }),
          { incr: () => value += 1 }
        );
      })()
    `,
    [],
    [],
    ['counter'],
  );
  await E(host).provideWorker(['plain-worker']);

  await t.throwsAsync(
    E(host).makeXsnapRef('plain-worker', 'counter', 'bad-facade'),
    {
      message: /xsnap worker/u,
    },
  );
});

test('xsnap facade forwards target failures without retry semantics', async t => {
  const { config, cancelled } = await prepareConfig(t);
  const host = await makeHost(config, cancelled);
  await E(host).provideWorker(['w1']);
  await E(host).provideWorker(['w2']);
  await E(host).evaluate(
    'w1',
    `
      (() => {
        let failNextCall = true;
        return makeExo(
          'FlakyCounter',
          M.interface('FlakyCounter', {}, { defaultGuards: 'passable' }),
          {
            incr: () => {
              if (failNextCall) {
                failNextCall = false;
                throw new Error('transient');
              }
              return 42;
            },
          }
        );
      })()
    `,
    [],
    [],
    ['flaky'],
  );
  await E(host).makeXsnapRef('xsw', 'flaky', 'flaky-facade');

  await t.throwsAsync(
    E(host).evaluate('w2', 'E(facade).incr()', ['facade'], ['flaky-facade']),
    {
      message: 'transient',
    },
  );

  const value = await E(host).evaluate(
    'w2',
    'E(facade).incr()',
    ['facade'],
    ['flaky-facade'],
  );
  t.is(value, 42);

  const facadeId = await E(host).identify('flaky-facade');
  t.truthy(facadeId);
  const facadeFormula = await readFormulaById(config, facadeId);
  t.is(facadeFormula.type, 'xsnap-ref');
  t.is(facadeFormula.worker, await E(host).identify('xsw'));
});

test('xsnap facade rejects non-xsnap worker selection', async t => {
  const { config, cancelled } = await prepareConfig(t);
  const host = await makeHost(config, cancelled);
  await E(host).provideWorker(['w1']);
  await E(host).provideWorker(['w2']);
  await E(host).provideWorker(['plain-worker']);
  await E(host).evaluate(
    'w1',
    `
      (() => {
        let value = 0;
        return makeExo(
          'Counter',
          M.interface('Counter', {}, { defaultGuards: 'passable' }),
          { incr: () => value += 1 }
        );
      })()
    `,
    [],
    [],
    ['counter'],
  );
  await t.throwsAsync(
    E(host).makeXsnapRef('plain-worker', 'counter', 'counter-facade'),
    {
      message: /xsnap-ref requires an xsnap worker/u,
    },
  );
});

test('xsnap facade diagnostics report call counts and failures', async t => {
  const { config, cancelled } = await prepareConfig(t);
  const host = await makeHost(config, cancelled);
  await E(host).provideWorker(['w1']);
  await E(host).provideWorker(['w2']);
  await E(host).evaluate(
    'w1',
    `
      (() => {
        let calls = 0;
        return makeExo(
          'AlwaysFail',
          M.interface('AlwaysFail', {}, { defaultGuards: 'passable' }),
          {
            incr: () => {
              calls += 1;
              throw new Error('always-fails-' + calls);
            },
          }
        );
      })()
    `,
    [],
    [],
    ['always-fail'],
  );
  await E(host).makeXsnapRef('xsw', 'always-fail', 'always-fail-facade');

  await t.throwsAsync(
    E(host).evaluate(
      'w2',
      'E(facade).incr()',
      ['facade'],
      ['always-fail-facade'],
    ),
    {
      message: /always-fails-/u,
    },
  );

  const diagnostics = await E(host).evaluate(
    'w2',
    'E.get(facade).diagnostics',
    ['facade'],
    ['always-fail-facade'],
  );
  const typedDiagnostics = /** @type {any} */ (diagnostics);
  t.is(typeof typedDiagnostics.callCount, 'number');
  t.truthy(typedDiagnostics.callCount);
  t.true(
    typedDiagnostics.lastFailure === undefined ||
      typeof typedDiagnostics.lastFailure === 'string',
  );
  t.is(typedDiagnostics.targetId, await E(host).identify('always-fail'));
});

test('xsnap facade rebinds to latest name target via hub/path', async t => {
  const { config, cancelled } = await prepareConfig(t);
  const host = await makeHost(config, cancelled);
  await E(host).provideWorker(['w1']);
  await E(host).provideWorker(['w2']);
  await E(host).evaluate(
    'w1',
    `
      (() => {
        let value = 0;
        return makeExo(
          'CounterA',
          M.interface('CounterA', {}, { defaultGuards: 'passable' }),
          { incr: () => value += 1 }
        );
      })()
    `,
    [],
    [],
    ['counter'],
  );
  await E(host).makeXsnapRef('xsw', 'counter', 'counter-facade');
  t.is(
    await E(host).evaluate(
      'w2',
      'E(facade).incr()',
      ['facade'],
      ['counter-facade'],
    ),
    1,
  );

  await E(host).evaluate(
    'w1',
    `
      (() => {
        let value = 100;
        return makeExo(
          'CounterB',
          M.interface('CounterB', {}, { defaultGuards: 'passable' }),
          { incr: () => value += 1 }
        );
      })()
    `,
    [],
    [],
    ['counter-new'],
  );
  await E(host).move(['counter-new'], ['counter']);

  const reboundValue = await E(host).evaluate(
    'w2',
    'E(facade).incr()',
    ['facade'],
    ['counter-facade'],
  );
  t.is(reboundValue, 101);

  const diagnostics = await E(host).evaluate(
    'w2',
    'E.get(facade).diagnostics',
    ['facade'],
    ['counter-facade'],
  );
  const typedDiagnostics = /** @type {any} */ (diagnostics);
  t.true(typeof typedDiagnostics.lastRebindMs === 'number');
  t.true(
    typedDiagnostics.lookupPath === undefined ||
      Array.isArray(typedDiagnostics.lookupPath),
  );
});

test('bidirectional xsnap/non-xsnap calls survive full restart teardown', async t => {
  const { config, cancelled } = await prepareConfig(t);

  {
    const host = await makeHost(config, cancelled);
    await E(host).provideWorker(['w1']);
    await E(host).provideWorker(['w2']);

    // Non-xsnap formula in worker w1.
    await E(host).evaluate(
      'w1',
      `
        (() => {
          let value = 0;
          return makeExo(
            'PlainCounter',
            M.interface('PlainCounter', {}, { defaultGuards: 'passable' }),
            { incr: () => value += 1 }
          );
        })()
      `,
      [],
      [],
      ['plain-counter'],
    );

    // Non-xsnap caller formula in worker w2.
    await E(host).evaluate(
      'w2',
      `
        (() => makeExo(
          'PlainCaller',
          M.interface('PlainCaller', {}, { defaultGuards: 'passable' }),
          {
            callIncr: target => E(target).incr(),
          },
        ))()
      `,
      [],
      [],
      ['plain-caller'],
    );

    // Xsnap-scoped facade formula (materialized by an xsnap worker).
    await E(host).makeXsnapRef('xsw', 'plain-counter', 'xsnap-counter');

    // Direction 1: non-xsnap worker -> xsnap formula (facade value).
    t.is(
      await E(host).evaluate(
        'w2',
        'E(caller).callIncr(counter)',
        ['caller', 'counter'],
        ['plain-caller', 'xsnap-counter'],
      ),
      1,
    );

    // Direction 2: xsnap formula (facade value) -> non-xsnap formula target.
    t.is(
      await E(host).evaluate(
        'w2',
        'E(counter).incr()',
        ['counter'],
        ['xsnap-counter'],
      ),
      2,
    );
  }

  await restart(config);

  {
    const host = await makeHost(config, cancelled);

    // Re-verify both directions after full daemon restart/teardown.
    t.is(
      await E(host).evaluate(
        'w2',
        'E(caller).callIncr(counter)',
        ['caller', 'counter'],
        ['plain-caller', 'xsnap-counter'],
      ),
      1,
    );
    t.is(
      await E(host).evaluate(
        'w2',
        'E(counter).incr()',
        ['counter'],
        ['xsnap-counter'],
      ),
      2,
    );
  }
});

test('xsnapEvaluate creates xsnap-worker formulas with restart-scoped state', async t => {
  const { config, cancelled } = await prepareConfig(t);

  {
    const host = await makeHost(config, cancelled);
    await E(host).provideWorker(['w2']);

    await E(host).xsnapEvaluate(
      'xsw',
      `
        (() => {
          let value = 0;
          return makeExo(
            'XsnapCounter',
            M.interface('XsnapCounter', {}, { defaultGuards: 'passable' }),
            { incr: () => value += 1 }
          );
        })()
      `,
      [],
      [],
      ['xsnap-counter'],
    );

    const xsnapCounterId = await E(host).identify('xsnap-counter');
    t.truthy(xsnapCounterId);
    const xsnapCounterFormula = await readFormulaById(config, xsnapCounterId);
    t.is(xsnapCounterFormula.type, 'eval');
    const workerFormula = await readFormulaById(config, xsnapCounterFormula.worker);
    t.is(workerFormula.type, 'xsnap-worker');

    t.is(
      await E(host).evaluate(
        'w2',
        'E(counter).incr()',
        ['counter'],
        ['xsnap-counter'],
      ),
      1,
    );
    t.is(
      await E(host).evaluate(
        'w2',
        'E(counter).incr()',
        ['counter'],
        ['xsnap-counter'],
      ),
      2,
    );
  }

  await restart(config);

  {
    const host = await makeHost(config, cancelled);
    t.is(
      await E(host).evaluate(
        'w2',
        'E(counter).incr()',
        ['counter'],
        ['xsnap-counter'],
      ),
      1,
    );
    t.is(
      await E(host).evaluate(
        'w2',
        'E(counter).incr()',
        ['counter'],
        ['xsnap-counter'],
      ),
      2,
    );
  }
});
