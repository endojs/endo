/**
 * Composable AST pipeline for JavaScript module analysis and transformation.
 *
 * Composes Babel visitor passes from multiple packages into a single
 * parse-traverse-generate cycle, eliminating redundant AST parsing.
 *
 * @module
 */

/** @import {ComposedParserOptions, RecordBuilder} from './external.types.js' */
/** @import {ParseFn, ParserImplementation} from '@endo/compartment-mapper' */
/** @import {ParserOptions} from '@babel/parser' */

import { parse as parseBabel } from '@babel/parser';
import { generate as generateBabel } from '@babel/generator';
import traverse from '@babel/traverse';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const { default: traverseBabel } = traverse;

/**
 * A no-op
 */
const noop = () => {};

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
 *
 * @param {RecordBuilder} recordBuilder - Builds the module record from
 *   generated code. Required because `ParseFn` must return a `record`.
 * @param {ComposedParserOptions} options
 * @returns {ParserImplementation} An object with a `parse` method compatible with
 *   compartment-mapper's `parserForLanguage` entries.
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
 * @template {readonly any[]} TAnalyzerResults
 * @overload
 * @param {RecordBuilder} recordBuilder - Builds the module record from
 *   generated code. Required because `ParseFn` must return a `record`.
 * @param {ComposedParserOptions<TAnalyzerResults>} options
 * @returns {ParserImplementation} An object with a `parse` method compatible with
 *   compartment-mapper's `parserForLanguage` entries.
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
    log: _log,
    sourceType = 'mjs',
  } = {},
) {
  /**
   * A CommonJS parser should use a heuristic to detect imports.
   * @type {ParserImplementation['heuristicImports']}
   */
  const heuristicImports = sourceType === 'cjs';

  /**
   * CommonJS allows a top-level return statement in lieu of a `module.exports`/`exports`.
   * @type {ParserOptions['allowReturnOutsideFunction']}
   */
  const allowReturnOutsideFunction = sourceType === 'cjs';

  /**
   * The source type to pass to `@babel/parser`. Defaults to `'unambiguous'`,
   * which lets the parser decide.
   * @type {Exclude<NonNullable<ParserOptions['sourceType']>, 'script'>}
   */
  let babelSourceType;
  switch (sourceType) {
    case 'mjs':
      babelSourceType = 'module';
      break;
    case 'cjs':
      babelSourceType = 'commonjs';
      break;
    default:
      babelSourceType = 'unambiguous';
  }

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
      allowReturnOutsideFunction,
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

    if (transformedSourceMap !== null && sourceMapHook) {
      // The import hook wraps this into a one-arg callback that captures the
      // raw source map object and ignores the details. The real
      // SourceMapHookDetails (compartment, module, location, sha512) are added
      // by the import hook after parse() returns.
      sourceMapHook(JSON.stringify(transformedSourceMap), {
        compartment: '',
        module: specifier,
        location,
        sha512: '',
      });
    }

    const analyzerResults = analyzerPasses.map(pass => pass.getResults());

    onModuleComplete({
      location,
      specifier,
      analyzerResults,
    });

    const record = recordBuilder(transformedSource, location);

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
