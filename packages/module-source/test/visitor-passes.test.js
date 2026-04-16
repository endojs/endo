/* eslint-disable no-underscore-dangle */
import test from '@endo/ses-ava/prepare-endo.js';
import { parse as parseBabel } from '@babel/parser';
import babelTraverse from '@babel/traverse';
import { generate as generateBabel } from '@babel/generator';
import { createModuleSourcePasses } from '../src/visitor-passes.js';
import { ModuleSource } from '../src/module-source.js';

const { default: traverseBabel } = babelTraverse;

test('createModuleSourcePasses returns analyzerPass, transformPass, and buildRecord', t => {
  const passes = createModuleSourcePasses();
  t.is(typeof passes.analyzerPass, 'object');
  t.is(typeof passes.analyzerPass.visitor, 'object');
  t.is(typeof passes.analyzerPass.getResults, 'function');
  t.is(typeof passes.transformPass, 'object');
  t.is(typeof passes.transformPass.visitor, 'object');
  t.is(typeof passes.buildRecord, 'function');
});

test('visitor passes produce same imports/exports as ModuleSource', t => {
  const source = `
    import { foo } from 'bar';
    import * as baz from 'qux';
    export const x = foo();
    export { baz };
  `;

  const ms = new ModuleSource(source);

  const passes = createModuleSourcePasses();
  const ast = parseBabel(source, {
    sourceType: 'module',
    tokens: true,
    createParenthesizedExpressions: true,
  });

  traverseBabel(ast, passes.analyzerPass.visitor);
  traverseBabel(ast, passes.transformPass.visitor);

  const analysis = passes.analyzerPass.getResults();

  t.deepEqual([...analysis.imports].sort(), [...ms.imports].sort());
  t.deepEqual([...analysis.exports].sort(), [...ms.exports].sort());
  t.deepEqual([...analysis.reexports].sort(), [...ms.reexports].sort());
});

test('buildRecord produces a record with __syncModuleProgram__', t => {
  const source = `import { foo } from 'bar'; export const x = foo();`;

  const passes = createModuleSourcePasses();
  const ast = parseBabel(source, {
    sourceType: 'module',
    tokens: true,
    createParenthesizedExpressions: true,
  });

  traverseBabel(ast, passes.analyzerPass.visitor);
  traverseBabel(ast, passes.transformPass.visitor);

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

  const record = /** @type {any} */ (
    passes.buildRecord(code, 'file:///test.js')
  );

  t.truthy(record.__syncModuleProgram__);
  t.true(typeof record.__syncModuleProgram__ === 'string');
  t.truthy(record.imports);
  t.truthy(record.exports);
  t.truthy(record.__fixedExportMap__);
});

test('re-exports are correctly detected', t => {
  const source = `export * from 'reexported-module';`;

  const ms = new ModuleSource(source);

  const passes = createModuleSourcePasses();
  const ast = parseBabel(source, {
    sourceType: 'module',
    tokens: true,
    createParenthesizedExpressions: true,
  });

  traverseBabel(ast, passes.analyzerPass.visitor);
  const analysis = passes.analyzerPass.getResults();

  t.deepEqual(analysis.reexports, ms.reexports);
});
