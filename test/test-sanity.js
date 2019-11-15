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
    t.throws(
      () => evaluateModule('const $c\u200d_myVar = 123; $c\u200d_myVar'),
      SyntaxError,
      'constified variable reference fails',
    );
    t.equal(
      evaluateModule('const $h\u200d_import2 = 123; $h\u200d_import2'),
      123,
      'zero width joiner non-reserved works',
    );

    t.equal(
      evaluateModule(`\
class outer {
  #x = 42;
  f() {
    return this.#x;
  }
}
new outer().f();
`),
      42,
      'private member syntax works',
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
