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
    await E(host).makeXsnapRef('counter', 'counter-facade');
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
    t.is(facadeFormula.retry, undefined);
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

test('xsnap facade retry once rebinds after transient target failure', async t => {
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
  await E(host).makeXsnapRef('flaky', 'flaky-facade', 'once');

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
  t.is(facadeFormula.retry, 'once');
});
