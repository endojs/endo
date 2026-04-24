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

test('non-xsnap callers can invoke xsnapEvaluate values across restart', async t => {
  const { config, cancelled } = await prepareConfig(t);

  {
    const host = await makeHost(config, cancelled);
    await E(host).provideWorker(['w2']);
    await E(host).provideXsnapWorker(['xsw']);

    await E(host).xsnapEvaluate(
      'xsw',
      `
        (() => {
          let value = 0;
          return makeExo(
            'XsnapCounter',
            M.interface('PlainCounter', {}, { defaultGuards: 'passable' }),
            { incr: () => value += 1 }
          );
        })()
      `,
      [],
      [],
      ['xsnap-counter'],
    );

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
        'E(caller).callIncr(counter)',
        ['caller', 'counter'],
        ['plain-caller', 'xsnap-counter'],
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
        'E(caller).callIncr(counter)',
        ['caller', 'counter'],
        ['plain-caller', 'xsnap-counter'],
      ),
      3,
    );
    t.is(
      await E(host).evaluate(
        'w2',
        'E(caller).callIncr(counter)',
        ['caller', 'counter'],
        ['plain-caller', 'xsnap-counter'],
      ),
      4,
    );
  }
});

test('xsnapEvaluate callers can invoke non-xsnap values across restart', async t => {
  const { config, cancelled } = await prepareConfig(t);

  {
    const host = await makeHost(config, cancelled);
    await E(host).provideWorker(['w1']);
    await E(host).provideWorker(['w2']);
    await E(host).provideXsnapWorker(['xsw']);

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

    await E(host).xsnapEvaluate(
      'xsw',
      `
        (() => makeExo(
          'XsnapCallerBridge',
          M.interface('XsnapCallerBridge', {}, { defaultGuards: 'passable' }),
          {
            callIncr: () => E(counter).incr(),
          }
        ))()
      `,
      ['counter'],
      ['plain-counter'],
      ['xsnap-caller'],
    );

    t.is(
      await E(host).evaluate(
        'w2',
        'E(caller).callIncr()',
        ['caller'],
        ['xsnap-caller'],
      ),
      1,
    );
    const xsnapCallerId = await E(host).identify('xsnap-caller');
    t.truthy(xsnapCallerId);
    const xsnapCallerFormula = await readFormulaById(config, xsnapCallerId);
    t.is(xsnapCallerFormula.type, 'eval');
    const callerWorkerFormula = await readFormulaById(
      config,
      xsnapCallerFormula.worker,
    );
    t.is(callerWorkerFormula.type, 'xsnap-worker');
  }

  await restart(config);

  {
    const host = await makeHost(config, cancelled);

    t.is(
      await E(host).evaluate(
        'w2',
        'E(caller).callIncr()',
        ['caller'],
        ['xsnap-caller'],
      ),
      1,
    );
    t.is(
      await E(host).evaluate(
        'w2',
        'E(caller).callIncr()',
        ['caller'],
        ['xsnap-caller'],
      ),
      2,
    );
  }
});
