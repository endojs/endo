/**
 * Core AST pipeline: (pre-process) → parse → analyze → transform → generate.
 *
 * Shared by the synchronous parser (`parsers.js`) and the worker message
 * handler (`worker-runner.js`). Neither caller needs to import Babel directly.
 *
 * @module
 * @internal
 */

/**
 * @import { RunPipelineOptions, RunPipelineResult } from './types/internal.js'
 * @import { PipelineLanguage, PipelineRecord, VisitorPass } from './types/pipeline.js'
 */

import { parse as parseBabel } from '@babel/parser';
import { generate as generateBabel } from '@babel/generator';
import traverse from '@babel/traverse';
import { LANGUAGES } from './languages.js';

const { default: traverseBabel } = traverse;

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

/**
 * Runs the full Babel pipeline for a single module: decode → (pre-process if
 * needed, e.g. strip TS types for `mts`) → parse → analyze → transform →
 * generate → encode.
 *
 * Language-specific behaviour (source type, analyzer, optional pre-processor,
 * default parser options) is resolved from the {@link LANGUAGES} registry;
 * `run-pipeline.js` has no per-language `if`/`switch` logic.
 *
 * Source maps are enabled whenever `sourceMapHook` is provided — the implicit
 * module-source transform always rewrites the AST so the map is meaningful.
 *
 * `finalizeRecord` and lifecycle hooks (`onModuleStart`, `onModuleComplete`)
 * are intentionally left to the caller — they differ between the sync and
 * worker execution paths.
 *
 * @template {PipelineLanguage} TLanguage
 * @param {RunPipelineOptions<TLanguage>} params
 * @returns {RunPipelineResult<TLanguage>}
 * @internal
 */
export const runPipeline = ({
  bytes,
  specifier,
  location,
  language,
  visitorFactories = [],
  parserOptions,
  generatorOptions,
  sourceMapHook,
}) => {
  const langDef = LANGUAGES[language];

  const rawSource = textDecoder.decode(bytes);
  const source = langDef.preProcessSource
    ? langDef.preProcessSource(rawSource, location)
    : rawSource;

  // Fresh per-module analysis context (owns the mutable sourceOptions state).
  const ctx = langDef.createAnalysisContext();

  const ast = parseBabel(source, {
    // Language-level defaults (e.g. parser plugins for a future tsx language)
    // are merged first so user options can override them, while the pipeline's
    // hard-coded requirements always win last.
    ...langDef.babelParserOptions,
    ...parserOptions,
    errorRecovery: true,
    sourceType: langDef.sourceType,
    tokens: true,
    createParenthesizedExpressions: true,
  });

  // Implicit module-source analyzer runs first so it sees the original AST.
  traverseBabel(ast, ctx.analyzePass.visitor);

  // User-defined passes run in order. Each pass's done() fires immediately
  // after its own traversal so later passes see any mutations made earlier.
  const passes = visitorFactories.map(factory => factory(location, specifier));
  const visitorResults = passes.map(
    /** @param {VisitorPass<unknown>} pass */
    pass => {
      traverseBabel(ast, pass.visitor);
      return pass.done?.();
    },
  );

  // Implicit module-source transform runs last.
  traverseBabel(ast, ctx.transformPass.visitor);

  // Generate a source map whenever the consumer asks for one. The implicit
  // module-source transform always rewrites the AST, so the map is meaningful
  // regardless of whether any user pass ran.
  const needsSourceMaps = sourceMapHook !== undefined;

  const { code: transformedSource, map: transformedSourceMap } = generateBabel(
    ast,
    {
      ...generatorOptions,
      sourceMaps: needsSourceMaps,
      // @ts-expect-error undocumented
      experimental_preserveFormat: true,
      preserveFormat: true,
      retainLines: true,
      verbatim: true,
    },
    source,
  );

  if (sourceMapHook && transformedSourceMap) {
    sourceMapHook(transformedSourceMap);
  }

  // Module-source builds the structuredClone-compatible record.
  const record = /** @type {PipelineRecord<TLanguage>} */ (
    ctx.buildRecord(transformedSource, location)
  );
  const transformedBytes = textEncoder.encode(transformedSource);

  /** @type {RunPipelineResult<TLanguage>} */
  const result = { transformedBytes, visitorResults, record };

  if (ast.errors?.length) {
    result.errors = ast.errors;
  }

  return result;
};
