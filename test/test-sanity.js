/* global Compartment */

import '@agoric/install-ses';
import test from 'ava';
import bundleSource from '..';

function evaluate(src, endowments) {
  const c = new Compartment(endowments, {}, {});
  return c.evaluate(src);
}

test('nestedEvaluate', async t => {
  const {
    moduleFormat: mf1,
    source: src1,
    sourceMap: map1,
  } = await bundleSource(`${__dirname}/../demo/dir1`, 'nestedEvaluate');

  const srcMap1 = `(${src1})\n${map1}`;

  // console.log(srcMap1);

  t.is(mf1, 'nestedEvaluate', 'module format is nestedEvaluate');

  const nestedEvaluate = src => {
    // console.log('========== evaluating', src);
    return evaluate(src, { nestedEvaluate });
  };
  const ex1 = nestedEvaluate(srcMap1)();

  const bundle = ex1.default();
  const err = bundle.makeError('foo');
  // console.log(err.stack);
  t.assert(
    err.stack.indexOf('(/bundled-source/encourage.js:3:') >= 0,
    'bundled source is in stack trace with correct line number',
  );

  const err2 = bundle.makeError2('bar');
  t.assert(
    err2.stack.indexOf('(/bundled-source/index.js:10:') >= 0,
    'bundled source is in second stack trace with correct line number',
  );

  const {
    moduleFormat: mf2,
    source: src2,
    sourceMap: map2,
  } = await bundleSource(
    `${__dirname}/../demo/dir1/encourage.js`,
    'nestedEvaluate',
  );
  t.is(mf2, 'nestedEvaluate', 'module format 2 is nestedEvaluate');

  const srcMap2 = `(${src2})\n${map2}`;

  const ex2 = nestedEvaluate(srcMap2)();
  t.is(ex2.message, `You're great!`, 'exported message matches');
  t.is(
    ex2.encourage('Nick'),
    `Hey Nick!  You're great!`,
    'exported encourage matches',
  );
});

test('getExport', async t => {
  const {
    moduleFormat: mf1,
    source: src1,
    sourceMap: map1,
  } = await bundleSource(`${__dirname}/../demo/dir1`, 'getExport');

  const srcMap1 = `(${src1})\n${map1}`;

  // console.log(srcMap1);

  t.is(mf1, 'getExport', 'module format is getExport');

  // eslint-disable-next-line no-eval
  const ex1 = eval(`${srcMap1}`)();

  const bundle = ex1.default();
  const err = bundle.makeError('foo');
  t.assert(
    err.stack.indexOf('(/bundled-source/encourage.js:') < 0,
    'bundled source is not in stack trace',
  );

  const {
    moduleFormat: mf2,
    source: src2,
    sourceMap: map2,
  } = await bundleSource(`${__dirname}/../demo/dir1/encourage.js`);
  t.is(mf2, 'nestedEvaluate', 'module format 2 is nestedEvaluate');

  const srcMap2 = `(${src2})\n${map2}`;

  const nestedEvaluate = src => {
    // console.log('========== evaluating', src, '\n=========');
    return evaluate(src, { nestedEvaluate });
  };
  // eslint-disable-next-line no-eval
  const ex2 = nestedEvaluate(srcMap2)();
  t.is(ex2.message, `You're great!`, 'exported message matches');
  t.is(
    ex2.encourage('Nick'),
    `Hey Nick!  You're great!`,
    'exported encourage matches',
  );
});

test('babel-parser types', async t => {
  // Once upon a time, bundleSource mangled:
  //   function createBinop(name, binop) {
  //     return new TokenType(name, {
  //       beforeExpr,
  //       binop
  //     });
  //   }
  // into:
  //  function createBinop(name, binop) {  return new TokenType(name, {    beforeExpr,;    binop });};
  //
  // Make sure it's ok now. The function in question came
  // from @agoric/babel-parser/lib/tokenizer/types.js

  const { source: src1 } = await bundleSource(
    `${__dirname}/../demo/babel-parser-mangling.js`,
    'getExport',
  );

  t.truthy(!src1.match(/beforeExpr,;/), 'source is not mangled that one way');
  // the mangled form wasn't syntactically valid, do a quick check
  // eslint-disable-next-line no-eval
  (1, eval)(`(${src1})`);
});
