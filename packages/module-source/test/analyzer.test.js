/* eslint-disable no-underscore-dangle */
import test from '@endo/ses-ava/prepare-endo.js';
import { parse as parseBabel } from '@babel/parser';
import babelTraverse from '@babel/traverse';
import { generate as generateBabel } from '@babel/generator';
import { analyzeModule } from '../src/analyzer.js';

const { default: traverseBabel } = babelTraverse;

// --- ESM (analyzeModule) ---

test('analyzeModule returns context with analyzePass, transformPass, buildRecord', t => {
  const ctx = analyzeModule();
  t.is(typeof ctx.analyzePass, 'object');
  t.is(typeof ctx.analyzePass.visitor, 'object');
  t.is(typeof ctx.transformPass, 'object');
  t.is(typeof ctx.transformPass.visitor, 'object');
  t.is(typeof ctx.buildRecord, 'function');
});

test('analyzeModule() identifies imports and exports via buildRecord', t => {
  const source = `
    import { foo } from 'bar';
    import * as baz from 'qux';
    export const x = foo();
    export { baz };
  `;

  const ctx = analyzeModule();
  const ast = parseBabel(source, {
    sourceType: 'module',
    tokens: true,
    createParenthesizedExpressions: true,
  });

  traverseBabel(ast, ctx.analyzePass.visitor);
  traverseBabel(ast, ctx.transformPass.visitor);

  const { code } = generateBabel(
    ast,
    // @ts-expect-error undocumented option
    { retainLines: true, verbatim: true },
    source,
  );

  const record = ctx.buildRecord(code);
  t.deepEqual([...record.imports].sort(), ['bar', 'qux']);
  t.true(record.exports.includes('x'));
  t.true(record.exports.includes('baz'));
});

test('analyzeModule().buildRecord produces a record with __syncModuleProgram__', t => {
  const source = `import { foo } from 'bar'; export const x = foo();`;

  const ctx = analyzeModule();
  const ast = parseBabel(source, {
    sourceType: 'module',
    tokens: true,
    createParenthesizedExpressions: true,
  });

  traverseBabel(ast, ctx.analyzePass.visitor);
  traverseBabel(ast, ctx.transformPass.visitor);

  const { code } = generateBabel(
    ast,
    {
      // @ts-expect-error undocumented
      experimental_preserveFormat: true,
      preserveFormat: true,
      retainLines: true,
    },
    source,
  );
  const record = /** @type {any} */ (ctx.buildRecord(code));
  t.is(typeof record.__syncModuleProgram__, 'string');
  t.true(record.__syncModuleProgram__.includes('const x'));
});

test('analyzeModule instances are independent (fresh state each call)', t => {
  const source1 = `import { a } from 'pkg-a'; export const a2 = a;`;
  const source2 = `import { b } from 'pkg-b'; export const b2 = b;`;

  const ctx1 = analyzeModule();
  const ctx2 = analyzeModule();

  const parse = src =>
    parseBabel(src, {
      sourceType: 'module',
      tokens: true,
      createParenthesizedExpressions: true,
    });

  const gen = (ast, src) =>
    generateBabel(
      ast,
      // @ts-expect-error undocumented option
      { retainLines: true, verbatim: true },
      src,
    ).code;

  traverseBabel(parse(source1), ctx1.analyzePass.visitor);
  traverseBabel(parse(source2), ctx2.analyzePass.visitor);

  const ast1 = parse(source1);
  traverseBabel(ast1, ctx1.analyzePass.visitor);
  traverseBabel(ast1, ctx1.transformPass.visitor);
  const record1 = ctx1.buildRecord(gen(ast1, source1));

  const ast2 = parse(source2);
  traverseBabel(ast2, ctx2.analyzePass.visitor);
  traverseBabel(ast2, ctx2.transformPass.visitor);
  const record2 = ctx2.buildRecord(gen(ast2, source2));

  t.deepEqual([...record1.imports].sort(), ['pkg-a']);
  t.deepEqual([...record2.imports].sort(), ['pkg-b']);
});
