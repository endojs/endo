import test from 'ava';
import { makeEvaluators } from '@agoric/make-simple-evaluate';

import * as babelStandalone from '@babel/standalone';

import { makeModuleTransformer } from '../src/main.js';

const { default: babel } = babelStandalone;
test('sanity', async t => {
  try {
    const transforms = [makeModuleTransformer(babel)];
    const { evaluateExpr, evaluateProgram: evaluateModule } = makeEvaluators({
      transforms,
    });

    t.is(
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
    t.is(
      evaluateModule('const $h\u200d_import2 = 123; $h\u200d_import2'),
      123,
      'zero width joiner non-reserved works',
    );

    t.is(
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

    t.is(evaluateModule('123; 456'), 456, 'program evaluates');
    t.is(evaluateExpr('123'), 123, 'expression evaluates');
    t.throws(
      () => evaluateExpr('123; 456'),
      SyntaxError,
      'expr rejects program',
    );
  } catch (e) {
    console.log('unexpected exception', e);
    t.truthy(false, e);
  } finally {
  }
});
