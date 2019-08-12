import { test } from 'tape-promise/tape';
import { makeEvaluators } from '@agoric/evaluate';

import * as babelCore from '@babel/core';

import makeModuleTransformer from '../src/index';

test('export default', async t => {
  try {
    const transforms = [makeModuleTransformer(babelCore)];
    const { evaluateExpr, evaluateProgram, evaluateModule } = makeEvaluators({
      transforms,
    });
    for (const [name, myEval] of Object.entries({
      evaluateExpr,
      evaluateProgram,
    })) {
      t.deepEqual(
        // eslint-disable-next-line no-await-in-loop
        await myEval(
          `import('foo')`,
          {},
          {
            loader(spec) {
              return Promise.resolve([
                '.',
                `export default ${JSON.stringify(spec)};`,
              ]);
            },
          },
        ),
        { default: 'foo' },
        `${name} import expression works`,
      );
    }
    t.deepEqual(
      await evaluateModule(`export default bb;`, { bb: 'bingbang' }),
      { default: 'bingbang' },
      `endowed modules`,
    );

    const ns = await evaluateModule(`\
export default arguments;`);
    t.equal(typeof ns.default, 'object', 'arguments is an object');
    t.equal(ns.default.length, 1, 'arguments has only one entry');
    t.equal(typeof ns.default[0], 'string', 'arguments[0] is just string');

    const ns2 = await evaluateModule(`\
export default this;`);
    t.equal(ns2.default, undefined, 'this is undefined');
  } catch (e) {
    console.log('unexpected exception', e);
    t.assert(false, e);
  } finally {
    t.end();
  }
});
