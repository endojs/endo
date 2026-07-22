/**
 * Parity cross-check: `CjsModuleSource` vs `analyzeCommonJS`.
 *
 * For every corpus entry, both analyzers are run against the same source and
 * their `exports` / `reexports` outputs are compared. The one legitimate,
 * systematic difference is that `CjsModuleSource.exports` always includes
 * `'default'` (added by `buildCjsModuleRecord`), while the reference lexer
 * only emits `'default'` for non-object `module.exports` assignments. The
 * harness normalises this by unioning the reference set with `{'default'}`.
 *
 * Any remaining mismatch indicates a bug in `cjs-babel-plugin.js`.
 *
 * @module
 */
import test from '@endo/ses-ava/prepare-endo.js';
import { analyzeCommonJS } from '@endo/cjs-module-analyzer';
import { CjsModuleSource } from '../src/cjs-module-source.js';
import { corpus } from './_corpus.js';

for (const { name, source, failing } of corpus) {
  const title = `parity: ${name}${failing ? ` (reason: ${failing})` : ''}`;

  const testFn = failing ? test.failing : test;

  testFn(title, t => {
    const lex = analyzeCommonJS(source);
    const ast = new CjsModuleSource(source, { sourceUrl: 'index.js' });

    const lexExportsWithDefault = new Set([...lex.exports, 'default']);
    const astExports = new Set(ast.exports);
    const lexReexports = new Set(lex.reexports);
    const astReexports = new Set(ast.reexports);

    t.deepEqual(
      astExports,
      lexExportsWithDefault,
      `exports mismatch\n  ast:    ${JSON.stringify([...astExports].sort())}\n  lexer:  ${JSON.stringify([...lexExportsWithDefault].sort())}`,
    );
    t.deepEqual(
      astReexports,
      lexReexports,
      `reexports mismatch\n  ast:    ${JSON.stringify([...astReexports].sort())}\n  lexer:  ${JSON.stringify([...lexReexports].sort())}`,
    );
  });
}
