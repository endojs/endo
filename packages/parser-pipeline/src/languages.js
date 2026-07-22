/**
 * Internal language registry for `@endo/parser-pipeline`.
 *
 * Each entry in {@link LANGUAGES} bundles all per-language behavioural knobs
 * into one place. Adding a new language is a single row here; no other files
 * need changing.
 *
 * @module
 * @internal
 */

/**
 * @import { LanguageRegistry } from './types/internal.js'
 * @import { CjsLanguage, RecordFinalizer } from './types/pipeline.js'
 */

import nodeModule from 'node:module';
import { buildCjsExecuteRecord } from '@endo/compartment-mapper/cjs.js';
import { analyzeModule, analyzeCjs } from '@endo/module-source/analyzer.js';

const { freeze } = Object;

/**
 * Default {@link RecordFinalizer} for CJS.
 *
 * Calls `buildCjsExecuteRecord` which attaches the `execute` closure and
 * resolves `__dirname` / `__filename`.
 *
 * @type {RecordFinalizer<CjsLanguage>}
 */
export const defaultCjsFinalizeRecord = (
  cjsRecord,
  location,
  packageLocation,
  parseOptions = {},
) =>
  buildCjsExecuteRecord(
    cjsRecord,
    location,
    parseOptions.readPowers,
    packageLocation,
  );

/**
 * Strips TypeScript type annotations from `source` using Node.js' built-in
 * `module.stripTypeScriptTypes()`.
 *
 * The strip-only mode whitespace-pads removed annotations so token offsets
 * and line numbers in the output match the input — preserving Babel's
 * source-position fidelity transitively through any downstream source map.
 *
 * @param {string} source
 * @param {string} location
 * @returns {string}
 * @throws {Error} If `stripTypeScriptTypes` is unavailable (requires Node.js
 *   v22.13.0 / v23.2.0 or newer) or if the source uses TypeScript features
 *   outside the strip-only subset (e.g. `enum`).
 */
const stripTypes = (source, location) => {
  if (!('stripTypeScriptTypes' in nodeModule)) {
    throw new Error(
      `Cannot strip TypeScript types from ${location}: ` +
        `node:module.stripTypeScriptTypes is not available on this Node.js ` +
        `runtime. Requires Node.js v22.13.0 / v23.2.0 or newer.`,
    );
  }
  // @ts-ignore -- needs @types/node@22.13.0+
  return nodeModule.stripTypeScriptTypes(source, { mode: 'strip' });
};

/**
 * Registry mapping every supported {@link PipelineLanguage} to its
 * {@link LanguageDefinition}.
 *
 * @type {LanguageRegistry}
 */
export const LANGUAGES = freeze({
  mjs: freeze({
    sourceType: 'module',
    createAnalysisContext: analyzeModule,
    heuristicImports: false,
  }),
  cjs: freeze({
    sourceType: 'commonjs',
    createAnalysisContext: analyzeCjs,
    heuristicImports: true,
    defaultFinalizeRecord: defaultCjsFinalizeRecord,
  }),
  mts: freeze({
    sourceType: 'module',
    createAnalysisContext: analyzeModule,
    heuristicImports: false,
    preProcessSource: stripTypes,
  }),
});
