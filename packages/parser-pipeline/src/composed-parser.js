/**
 * Provides {@link createComposedParser}, a Composable AST pipeline for
 * JavaScript module analysis and transformation.
 *
 * Composes Babel visitor passes from multiple packages into a single
 * parse-traverse-generate cycle, eliminating redundant AST parsing.
 *
 * @module
 * @groupDescription Composed Parser
 * Used with the synchronous composed parser pipeline.
 */

import { parse as parseBabel } from '@babel/parser';
import { generate as generateBabel } from '@babel/generator';
import traverse from '@babel/traverse';
import { CJS_SOURCE_TYPE, MJS_SOURCE_TYPE, noop } from './constants.js';
import { getBabelSourceType } from './source-type.js';

/** @import {ComposedParserOptions, RecordBuilder} from './types/external.js' */
/** @import {ParseFn, ParserImplementation} from '@endo/compartment-mapper' */

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const { default: traverseBabel } = traverse;

/**
 * Creates a `parserForLanguage`-compatible parser that composes multiple Babel
 * visitor passes into a single parse-traverse-generate cycle.
 *
 * The returned object has a `parse` method matching compartment-mapper's
 * `ParseFn` signature. For each module source:
 *
 * 1. Parses the source once via `@babel/parser`
 * 2. Instantiates fresh analyzer and transform visitors via factories
 * 3. Traverses the AST with each analyzer visitor (read-only, in order)
 * 4. Traverses the AST with each transform visitor (mutating, in order)
 * 5. Generates code once via `@babel/generator`
 * 6. Calls `onModuleComplete` with collected analyzer results, defined by {@link TAnalyzerResults}
 * 7. Returns a `ParseFn`-compatible result
 *
 * @template {readonly any[]} [TAnalyzerResults=unknown[]] The type of the analyzer results array returned by the parser.
 * @overload
 * @param {RecordBuilder} recordBuilder - Builds the module record from
 *   generated code. Required because `ParseFn` must return a `record`.
 * @param {ComposedParserOptions<TAnalyzerResults>} options
 * @returns {ParserImplementation} An object with a `parse` method compatible with
 *   compartment-mapper's `parserForLanguage` entries.
 * @group Composed Parser
 */

/**
 * Creates a `parserForLanguage`-compatible parser that composes multiple Babel
 * visitor passes into a single parse-traverse-generate cycle.
 *
 * The returned object has a `parse` method matching compartment-mapper's
 * `ParseFn` signature. For each module source:
 *
 * 1. Parses the source once via `@babel/parser`
 * 2. Instantiates fresh analyzer and transform visitors via factories
 * 3. Traverses the AST with each analyzer visitor (read-only, in order)
 * 4. Traverses the AST with each transform visitor (mutating, in order)
 * 5. Generates code once via `@babel/generator`
 * 6. Calls `onModuleComplete` with collected analyzer results (of `unknown[]` type)
 * 7. Returns a `ParseFn`-compatible result
 *
 * @overload
 * @param {RecordBuilder} recordBuilder - Builds the module record from
 *   generated code. Required because `ParseFn` must return a `record`.
 * @param {ComposedParserOptions} options
 * @returns {ParserImplementation} An object with a `parse` method compatible with
 *   compartment-mapper's `parserForLanguage` entries.
 * @group Composed Parser
 */

/**
 * Creates a `parserForLanguage`-compatible parser that composes multiple Babel
 * visitor passes into a single parse-traverse-generate cycle.
 *
 * The returned object has a `parse` method matching compartment-mapper's
 * `ParseFn` signature. For each module source:
 *
 * 1. Parses the source once via `@babel/parser`
 * 2. Instantiates fresh analyzer and transform visitors via factories
 * 3. Traverses the AST with each analyzer visitor (read-only, in order)
 * 4. Traverses the AST with each transform visitor (mutating, in order)
 * 5. Generates code once via `@babel/generator`
 * 6. Calls `onModuleComplete` with collected analyzer results
 * 7. Returns a `ParseFn`-compatible result
 *
 * @param {RecordBuilder} recordBuilder - Builds the module record from
 *   generated code. Required because `ParseFn` must return a `record`.
 * @param {ComposedParserOptions} options
 * @returns {ParserImplementation} An object with a `parse` method compatible with
 *   compartment-mapper's `parserForLanguage` entries.
 */
export function createComposedParser(
  recordBuilder,
  {
    analyzerFactories = [],
    transformFactories = [],
    sourcePreprocessor,
    onModuleComplete = noop,
    babelGeneratorOptions: generatorOptions,
    babelParserOptions: parserOptions,
    log: _log = noop,
    sourceType = MJS_SOURCE_TYPE,
  } = {},
) {
  /**
   * A CommonJS parser should use a heuristic to detect imports.
   * @type {ParserImplementation['heuristicImports']}
   */
  const heuristicImports = sourceType === CJS_SOURCE_TYPE;
  const babelSourceType = getBabelSourceType(sourceType);

  /** @type {ParseFn} */
  const parse = (
    bytes,
    specifier,
    location,
    _packageLocation,
    parseOptions,
  ) => {
    let source = textDecoder.decode(bytes);

    if (sourcePreprocessor) {
      source = sourcePreprocessor(source);
    }

    const ast = parseBabel(source, {
      sourceType: babelSourceType,
      tokens: true,
      createParenthesizedExpressions: true,
      ...parserOptions,
    });

    const analyzerPasses = analyzerFactories.map(factory =>
      factory(location, specifier),
    );

    const transformPasses = transformFactories.map(factory =>
      factory(location, specifier),
    );

    for (const pass of analyzerPasses) {
      traverseBabel(ast, pass.visitor);
    }

    for (const pass of transformPasses) {
      traverseBabel(ast, pass.visitor);
    }

    const { sourceMapHook } = parseOptions ?? {};
    const needsSourceMaps =
      sourceMapHook !== undefined && transformPasses.length > 0;

    const { code: transformedSource, map: transformedSourceMap } =
      generateBabel(
        ast,
        {
          sourceMaps: needsSourceMaps,
          // @ts-expect-error undocumented
          experimental_preserveFormat: true,
          preserveFormat: true,
          retainLines: true,
          verbatim: true,
          ...generatorOptions,
        },
        source,
      );

    if (sourceMapHook && transformedSourceMap) {
      // ParseSourceMapHook receives the raw source map object. The import
      // hook wraps the public SourceMapHook into this shape and handles
      // stringification + SourceMapHookDetails itself.
      sourceMapHook(transformedSourceMap);
    }

    const analyzerResults = analyzerPasses.map(pass => pass.getResults());

    onModuleComplete({
      location,
      specifier,
      analyzerResults,
    });

    const record = recordBuilder(transformedSource, location, parseOptions);

    const transformedBytes = textEncoder.encode(transformedSource);

    return {
      parser: sourceType,
      bytes: transformedBytes,
      record,
    };
  };

  parse.isSyncParser = true;

  return { parse, heuristicImports, synchronous: true };
}
