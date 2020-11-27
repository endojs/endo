import test from 'ava';
import {
  makeEvaluators,
  evaluateProgram as evaluate,
} from '@agoric/make-simple-evaluate';

import * as babelStandalone from '@babel/standalone';

import { makeModuleTransformer } from '../src/main.js';

const { default: babel } = babelStandalone;
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
      onceVar: onceProxy,
      liveVar: onceProxy,
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
    const transforms = [makeModuleTransformer(babel, importer)];
    const { evaluateModule } = makeEvaluators({
      transforms,
    });

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
  } catch (e) {
    console.log('unexpected exception', e);
    t.truthy(false, e);
  }
});

test(`export hoisting`, async t => {
  try {
    const importer = makeImporter(['abc', 'fn']);
    const transforms = [makeModuleTransformer(babel, importer)];
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
    t.is(abc2, undefined, `undefined instead of tdz`);
    t.is(abc, abc3, `var exports with hoisting`);
    t.is(abc, 123, `abc evaluates`);

    const { fn, fn2, fn3 } = await evaluateModule(`\
export const fn2 = fn;
export function fn() {
  return 'foo';
}
export const fn3 = fn;
`);
    t.is(fn2, fn, `function hoisting`);
    t.is(fn, fn3, `function exports with hoisting`);
    t.is(fn(), 'foo', `fn evaluates`);
  } catch (e) {
    t.not(e, e, 'unexpected exception');
  }
});

test(`export class`, async t => {
  try {
    const importer = makeImporter(['C', 'F', 'count']);
    const transforms = [makeModuleTransformer(babel, importer)];
    const { evaluateModule } = makeEvaluators({
      transforms,
    });

    const { C, count } = await evaluateModule(`\
export let count = 0;
export class C {} if (C) { count += 1; }
`);
    t.truthy(new C(), `class exports`);
    t.is(C.name, 'C', `class is named C`);
    t.is(count, 1, `class C is global`);

    const { default: C2 } = await evaluateModule(`\
export default class C {}
`);
    t.truthy(new C2(), `default class constructs`);
    t.is(C2.name, 'C', `C class name`);

    const { default: C3 } = await evaluateModule(`\
export default class {}
`);
    t.truthy(new C3(), `default class constructs`);
    t.is(C3.name, 'default', `default class name`);
    const { default: C4 } = await evaluateModule(`\
export default (class {});
`);
    t.truthy(new C4(), `default class expression constructs`);
    t.is(C4.name, 'default', `default class expression name`);

    const { F: F0 } = await evaluateModule(`\
F(123);
export function F(arg) { return arg; }
`);
    t.is(F0.name, 'F', `F function name`);

    const { default: F } = await evaluateModule(`\
export default async function F(arg) { return arg; }
`);
    t.is(F.name, 'F', `F function name`);
    const ret = F('foo');
    t.truthy(ret instanceof Promise, `F is async`);
    t.is(await ret, 'foo', `F returns correctly`);

    const { default: F2 } = await evaluateModule(`\
export default async function(arg) { return arg; };
`);
    t.is(F2.name, 'default', `F2 function default name`);
  } catch (e) {
    console.log('unexpected exception', e);
    t.truthy(false, e);
  }
});
