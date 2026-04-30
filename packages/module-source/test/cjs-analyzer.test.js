/* eslint-disable no-underscore-dangle */
import test from '@endo/ses-ava/prepare-endo.js';
import { parse as parseBabel } from '@babel/parser';
import babelTraverse from '@babel/traverse';
import { generate as generateBabel } from '@babel/generator';
import { makeCjsModuleAnalysisContext } from '../src/cjs-analyzer.js';

const { default: traverseBabel } = babelTraverse;

test('analyzeCjs returns context with analyzePass, transformPass, buildRecord', t => {
  const ctx = makeCjsModuleAnalysisContext();
  t.is(typeof ctx.analyzePass, 'object');
  t.is(typeof ctx.analyzePass.visitor, 'object');
  t.is(typeof ctx.transformPass, 'object');
  t.is(typeof ctx.transformPass.visitor, 'object');
  t.is(typeof ctx.buildRecord, 'function');
});

test('analyzeCjs() identifies requires and exports via buildRecord', t => {
  const source = `
    const dep = require('some-dep');
    exports.hello = () => dep.greet();
  `;

  const ctx = makeCjsModuleAnalysisContext();
  const ast = parseBabel(source, {
    sourceType: 'commonjs',
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
  // CJS: record.imports combines require() + import() specifiers
  t.true(record.imports.includes('some-dep'));
  t.true(record.exports.includes('hello'));
});

test('analyzeCjs().buildRecord produces a record with cjsFunctor', t => {
  const source = `exports.answer = 42;`;

  const ctx = makeCjsModuleAnalysisContext();
  const ast = parseBabel(source, {
    sourceType: 'commonjs',
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
      verbatim: true,
    },
    source,
  );

  const record = ctx.buildRecord(code);
  t.is(typeof record.cjsFunctor, 'string');
  t.true(record.cjsFunctor.includes('function'));
});
