import { test } from 'tape-promise/tape';
import { makeEvaluators } from '@agoric/evaluate';

import * as babelCore from '@babel/core';

import makeModuleTransformer from '../src/index';

test('sanity', async t => {
  try {
    const transforms = [makeModuleTransformer(babelCore)];
    const { evaluateExpr, evaluateProgram: evaluateModule } = makeEvaluators({
      transforms,
    });

    t.equal(
      evaluateModule('const $h_import = 123; $h_import'),
      123,
      'normal underbar works',
    );
    t.throws(
      () => evaluateModule('const $h\u200d_import = 123; $h\u200d_import'),
      SyntaxError,
      'zero width joiner reserved fails',
    );
    t.equal(
      evaluateModule('const $h\u200d_import2 = 123; $h\u200d_import2'),
      123,
      'zero width joiner non-reserved works',
    );

    t.equal(evaluateModule('123; 456'), 456, 'program evaluates');
    t.equal(evaluateExpr('123'), 123, 'expression evaluates');
    t.throws(
      () => evaluateExpr('123; 456'),
      SyntaxError,
      'expr rejects program',
    );
  } catch (e) {
    console.log('unexpected exception', e);
    t.assert(false, e);
  } finally {
    t.end();
  }
});

test('import expressions', async t => {
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
    );
  } catch (e) {
    console.log('unexpected exception', e);
    t.assert(false, e);
  } finally {
    t.end();
  }
});
