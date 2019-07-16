import { test } from 'tape-promise/tape';
import { makeEvaluators } from '@agoric/insecure-evaluate';

import * as babelParser from '@babel/parser';
import babelTraverse from '@babel/traverse';
import babelGenerate from '@babel/generator';

import makeModuleTransformer from '../src/index';

test('module rewrites', async t => {
  try {
    const transforms = [
      makeModuleTransformer(babelParser, babelTraverse, babelGenerate),
    ];
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
      TypeError,
      'zero width joiner fails',
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
    t.assert(false, e);
  } finally {
    t.end();
  }
});
