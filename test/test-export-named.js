import { test } from 'tape-promise/tape';
import { makeEvaluators } from '@agoric/evaluate';

import * as babelCore from '@babel/core';

import makeModuleTransformer from '../src/index';

test(`export named`, async t => {
  try {
    const transforms = [makeModuleTransformer(babelCore)];
    const { evaluateModule } = makeEvaluators({
      transforms,
    });

    t.deepEqual(
      await evaluateModule(`\
export const abc = 123;
// export const [ def, ghi ] = [ 456, 789 ];
export const def = 456, ghi = 789;
`),
      { abc: 123, def: 456, ghi: 789 },
      `const exports`,
    );

    t.deepEqual(
      await evaluateModule(`\
export let abc = 123;
export let def = 456;
def ++;
export const ghi = 789;
`),
      { abc: 123, def: 457, ghi: 789 },
      `let exports`,
    );
  } catch (e) {
    console.log('unexpected exception', e);
    t.assert(false, e);
  } finally {
    t.end();
  }
});
