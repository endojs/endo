import { test } from 'tape-promise/tape';
import { makeEvaluators, evaluateProgram as evaluate } from '@agoric/evaluate';

import * as babelCore from '@babel/core';

import makeModuleTransformer from '../src/index';

const makeImporter = (liveVars = []) => async (srcSpec, endowments) => {
  const { spec, staticRecord } = srcSpec;
  let actualSource;
  const doImport = async () => {
    const exportNS = {};
    const onceProxy = new Proxy(
      {},
      {
        get(_target, prop) {
          return value => (exportNS[prop] = value);
        },
      },
    );
    const makeLive = vname => ({
      get() {
        if (vname in exportNS) {
          return exportNS[vname];
        }
        throw ReferenceError(`${vname} is not defined`);
      },
      set(value) {
        return (exportNS[vname] = value);
      },
    });
    const props = {};
    liveVars.forEach(vname => (props[vname] = makeLive(vname)));
    const endow = Object.create(null, {
      ...Object.getOwnPropertyDescriptors(endowments),
      ...props,
    });
    const functorArg = {
      constVar: onceProxy,
      letVar: onceProxy,
      imports(_imports) {},
    };
    // console.log(staticRecord.functorSource);
    await evaluate(actualSource, endow)(functorArg);
    return exportNS;
  };

  if (spec === undefined && staticRecord !== undefined) {
    actualSource = staticRecord.functorSource;
    return doImport();
  }

  throw Error(`Not expecting import expression`);
};

test(`export named`, async t => {
  try {
    const importer = makeImporter(['def']);
    const transforms = [makeModuleTransformer(babelCore, importer)];
    const { evaluateModule } = makeEvaluators({
      transforms,
    });

    t.deepEqual(
      await evaluateModule(`\
export const abc = 123;
export const { def, nest: [, ghi, ...nestrest], ...rest } = { def: 456, nest: [ 'skip', 789, 'a', 'b' ], other: 999, and: 998 };
`),
      {
        abc: 123,
        def: 456,
        ghi: 789,
        rest: { other: 999, and: 998 },
        nestrest: ['a', 'b'],
      },
      `const exports`,
    );

    t.deepEqual(
      await evaluateModule(`\
export let abc = 123;
export let def = 456;
export let def2 = def;
def ++;
export const ghi = 789;
`),
      { abc: 123, def: 457, def2: 456, ghi: 789 },
      `let exports`,
    );
  } catch (e) {
    console.log('unexpected exception', e);
    t.assert(false, e);
  } finally {
    t.end();
  }
});

test(`export hoisting`, async t => {
  try {
    const importer = makeImporter(['abc', 'fn']);
    const transforms = [makeModuleTransformer(babelCore, importer)];
    const { evaluateModule } = makeEvaluators({
      transforms,
    });

    await t.rejects(
      evaluateModule(`\
const abc2 = abc;
export const abc = 123;
`),
      ReferenceError,
      `const exports without hoisting`,
    );

    await t.rejects(
      evaluateModule(`\
const abc2 = abc;
export let abc = 123;
`),
      ReferenceError,
      `let exports without hoisting`,
    );

    const { abc, abc2, abc3 } = await evaluateModule(`\
export const abc2 = abc;
export var abc = 123;
export const abc3 = abc;
`);
    t.equal(abc2, undefined, `undefined instead of tdz`);
    t.equal(abc, abc3, `var exports with hoisting`);
    t.equal(abc, 123, `abc evaluates`);

    const { fn, fn2, fn3 } = await evaluateModule(`\
export const fn2 = fn;
export function fn() {
  return 'foo';
}
export const fn3 = fn;
`);
    t.equal(fn2, undefined, `undefined instead of tdz`);
    t.equal(fn, fn3, `function exports with hoisting`);
    t.equal(fn(), 'foo', `fn evaluates`);
  } catch (e) {
    console.log('unexpected exception', e);
    t.assert(false, e);
  } finally {
    t.end();
  }
});
