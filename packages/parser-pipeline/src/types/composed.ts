/**
 * Types for the composed parser pipeline.
 *
 * @module
 */

import type { GeneratorOptions } from '@babel/generator';
import type { ParserOptions as BabelParserOptions } from '@babel/parser';
import type { ParseOptions } from '@endo/compartment-mapper';
import type { FinalStaticModuleType } from 'ses';
import type {
  AnalyzerFactory,
  LogFn,
  ModuleCompleteData,
  SourceType,
  TransformFactory,
} from './common.js';

/**
 * Builds the final module record for the **synchronous composed parser**
 * (`createComposedParser`). The returned value is used directly as
 * `ParseResult.record`, so it must be a full {@link FinalStaticModuleType} (may
 * include a non-serializable `execute` closure).
 *
 * @param source - The code produced by `@babel/generator`.
 * @param location - The module's file URL.
 * @param options - Options forwarded from the composed parser. Provides access
 *   to `readPowers` and other values from the original `parse()` call.
 * @group Composed Parser
 */
export type RecordBuilder = (
  source: string,
  location: string,
  options?: ParseOptions,
) => FinalStaticModuleType;

/**
 * Optional configuration for the composed parser pipeline.
 *
 * The generic parameter maps analyzer factories to their result types so that
 * `onModuleComplete` receives a well-typed tuple of results.
 *
 * @template TAnalyzerResults The type of the analyzer results array returned by
 * the parser. A tuple, defined by the caller.
 *
 * @example
 * ```ts
 * const opts: ComposedParserOptions<[Map<string, string>, string[]]> = {
 *   analyzerFactories: [globalsFactory, importsFactory],
 *   transformFactories: [evasiveFactory],
 *   onModuleComplete({ analyzerResults: [globals, imports] }) {
 *     // globals: Map<string, string>, imports: string[]
 *   },
 * };
 * ```
 * @group Composed Parser
 */
export interface ComposedParserOptions<
  TAnalyzerResults extends readonly any[] = unknown[],
> {
  /**
   * Factories that create analysis visitors.
   *
   * Each factory is called once per module and must return an
   * {@link AnalyzerPass} with fresh, independent state.
   */
  analyzerFactories?: {
    [K in keyof TAnalyzerResults]: AnalyzerFactory<TAnalyzerResults[K]>;
  };

  /**
   * Factories that create mutating transform visitors.
   *
   * Transforms run after all analyzers. Order matters: earlier transforms
   * see the AST before later transforms mutate it.
   */
  transformFactories?: TransformFactory[];

  /**
   * Optional function to pre-process the source string before Babel parsing.
   *
   * Use this for lightweight string-level transforms that must happen before
   * AST construction (e.g., hashbang removal, direct eval evasion).
   */
  sourcePreprocessor?: (source: string) => string;

  /**
   * Called after each module is fully analyzed and transformed, before the
   * pipeline returns to compartment-mapper.
   *
   * Use this to collect analysis results (e.g., globals maps, violations).
   */
  onModuleComplete?: (data: ModuleCompleteData<TAnalyzerResults>) => void;

  /**
   * Optional options to pass to `@babel/generator`.
   */
  babelGeneratorOptions?: GeneratorOptions;

  /**
   * Optional options to pass to `@babel/parser`.
   */
  babelParserOptions?: BabelParserOptions;

  /**
   * Optional function to log messages
   */
  log?: LogFn;

  /**
   * Expected source type for the parser.
   *
   * @defaultValue `mjs`
   */
  sourceType?: SourceType;
}
