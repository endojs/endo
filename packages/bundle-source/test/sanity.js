import { lockdown } from '@endo/lockdown';

import { decodeBase64 } from '@endo/base64';
import { parseArchive } from '@endo/compartment-mapper/import-archive.js';
import test from 'ava';
import bundleSource from '../src/index.js';

function evaluate(src, endowments) {
  const c = new Compartment(endowments, {}, {});
  return c.evaluate(src);
}

export function makeSanityTests(stackFiltering) {
  lockdown({ errorTaming: 'unsafe', stackFiltering });
  Error.stackTraceLimit = Infinity;

  const prefix = stackFiltering === 'concise' ? '' : '/bundled-source/.../';

  function stackContains(stack, filePattern) {
    return stack.indexOf(`${prefix}${filePattern}`) >= 0;
  }

  test(`endoZipBase64`, async t => {
    const { endoZipBase64 } = await bundleSource(
      new URL('../demo/dir1/encourage.js', import.meta.url).pathname,
      'endoZipBase64',
    );

    const bytes = decodeBase64(endoZipBase64);
    const archive = await parseArchive(bytes);
    // Call import by property to bypass SES censoring for dynamic import.
    // eslint-disable-next-line dot-notation
    const { namespace } = await archive['import']('.');
    const { message, encourage } = namespace;

    t.is(message, `You're great!`);
    t.is(encourage('you'), `Hey you!  You're great!`);
  });

  test(`nestedEvaluate`, async t => {
    const {
      moduleFormat: mf1,
      source: src1,
      sourceMap: map1,
    } = await bundleSource(
      new URL(`../demo/dir1`, import.meta.url).pathname,
      'nestedEvaluate',
    );

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
      stackContains(err.stack, 'encourage.js:2:'),
      'bundled source is in stack trace with correct line number',
    );

    const err2 = bundle.makeError2('bar');
    t.assert(
      stackContains(err2.stack, 'index.js:8:'),
      'bundled source is in second stack trace with correct line number',
    );

    const {
      moduleFormat: mf2,
      source: src2,
      sourceMap: map2,
    } = await bundleSource(
      new URL(`../demo/dir1/encourage.js`, import.meta.url).pathname,
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

  test(`getExport`, async t => {
    const {
      moduleFormat: mf1,
      source: src1,
      sourceMap: map1,
    } = await bundleSource(
      new URL(`../demo/dir1`, import.meta.url).pathname,
      'getExport',
    );

    const srcMap1 = `(${src1})\n${map1}`;

    // console.log(srcMap1);

    t.is(mf1, 'getExport', 'module format is getExport');

    // eslint-disable-next-line no-eval
    const ex1 = eval(`${srcMap1}`)();

    const bundle = ex1.default();
    const err = bundle.makeError('foo');
    t.assert(
      !stackContains(err.stack, 'encourage.js:'),
      'bundled source is not in stack trace',
    );

    const {
      moduleFormat: mf2,
      source: src2,
      sourceMap: map2,
    } = await bundleSource(
      new URL(`../demo/dir1/encourage.js`, import.meta.url).pathname,
      'nestedEvaluate',
    );
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
      new URL(`../demo/babel-parser-mangling.js`, import.meta.url).pathname,
      'getExport',
    );

    t.truthy(!src1.match(/beforeExpr,;/), 'source is not mangled that one way');
    // the mangled form wasn't syntactically valid, do a quick check
    // eslint-disable-next-line no-eval
    (1, eval)(`(${src1})`);
  });
}
