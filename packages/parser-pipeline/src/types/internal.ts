/**
 * Internal types for the parser pipeline.
 *
 * @module
 * @internal
 */

import type { ParseError } from '@babel/parser';
import type { ParseSourceMapHook } from '@endo/compartment-mapper';
import type {
  AnalysisOptions,
  CjsAnalysisContext,
  ModuleAnalysisContext,
} from '@endo/module-source';
import type {
  BabelGeneratorOptions,
  BabelParserOptions,
  BabelSourceType,
  CjsLanguage,
  FinalPipelineLanguageConfig,
  MjsLanguage,
  MtsLanguage,
  OnParseErrorFn,
  PipelineLanguage,
  PipelineLanguageConfig,
  PipelineRecord,
  RecordFinalizer,
  VisitorPassFactory,
} from './pipeline.js';

/**
 * CJS-specific pipeline configuration overrides.
 *
 * Narrows {@link PipelineLanguageConfig} for CJS by making `finalizeRecord`
 * required. CJS modules need a main-thread closure to attach `execute`,
 * `__dirname`, and `__filename`, so a finalizer is mandatory.
 *
 * @template TVisitorResults The type of the visitor results.
 * @internal
 */

export interface PipelineConfigForCjs<
  TVisitorResults extends readonly any[] = unknown[],
> extends PipelineLanguageConfig<CjsLanguage, TVisitorResults> {
  /** Main-thread finalizer for CJS. */
  finalizeRecord: RecordFinalizer<CjsLanguage>;
}

/**
 * Options for {@link runPipeline}.
 * @internal
 */
export interface RunPipelineOptions<TLanguage extends PipelineLanguage> {
  /**
   * Raw module bytes.
   */
  bytes: Uint8Array;
  /**
   * The module specifier.
   */
  specifier: string;
  /**
   * The module's file URL.
   */
  location: string;
  /**
   * The pipeline language.
   */
  language: TLanguage;
  /**
   * Visitor pass factories.
   */
  visitorFactories: VisitorPassFactory[];
  /**
   * Babel parser options.
   */
  parserOptions?: BabelParserOptions;
  /**
   * Babel generator options.
   */
  generatorOptions?: BabelGeneratorOptions;
  /**
   * Optional function to hook into the source map generation.
   */
  sourceMapHook?: ParseSourceMapHook;

  /**
   * Optional function to call with parsing errors.
   */
  onParseError?: OnParseErrorFn;
}

/**
 * The value returned by {@link runPipeline}.
 * @internal
 */
export interface RunPipelineResult<TLanguage extends PipelineLanguage> {
  /**
   * The transformed module bytes.
   */
  transformedBytes: Uint8Array<ArrayBuffer>;
  /**
   * Results from each visitor pass, in factory order. Passes that omit `done`
   * contribute `undefined` to their slot.
   */
  visitorResults: unknown[];
  /**
   * The module record.
   */
  record: PipelineRecord<TLanguage>;

  /**
   * Recoverable parsing errors from `@babel/parser`.
   */
  errors?: ParseError[];
}

/**
 * All per-language behavioural knobs bundled into one object.
 *
 * Adding a language is a single entry in the `LANGUAGES` registry in
 * `languages.js`; no other files need changing.
 *
 * @template TLanguage - The specific pipeline language this definition covers.
 * @internal
 */
export interface LanguageDefinition<
  TLanguage extends PipelineLanguage,
  TAnalysisContext,
> {
  /**
   * Babel `sourceType` for this language.
   *
   * `'module'` for ESM-flavored languages (mjs, mts);
   * `'commonjs'` for CJS-flavored ones.
   */
  sourceType: BabelSourceType;

  /**
   * Factory that creates a fresh per-module analysis context.
   *
   * Wraps `analyzeModule` (for ESM) or `analyzeCjs` (for CJS) from
   * `@endo/module-source/analyzer.js`.
   */
  createAnalysisContext: (opts?: AnalysisOptions) => TAnalysisContext;

  /**
   * Whether the Endo compartment mapper should use heuristic import scanning
   * for this language. `true` for CJS; `false` for all others.
   */
  heuristicImports: boolean;

  /**
   * Language-level default parser options merged below any user-supplied
   * `babelParserOptions` (user wins) and below the pipeline's hard-coded
   * requirements (`errorRecovery`, `tokens`, `sourceType`,
   * `createParenthesizedExpressions` — always win).
   *
   * Unused by the three built-in languages (mjs / cjs / mts). Provided so
   * future entries (e.g. a `tsx` language) can set parser plugins like
   * `{ plugins: ['typescript', 'jsx'] }` without touching `run-pipeline.js`.
   */
  babelParserOptions?: BabelParserOptions;

  /**
   * Optional source pre-processor invoked on the decoded string **before**
   * it is handed to `@babel/parser`.
   *
   * Used by `mts` to strip TypeScript type annotations via
   * `node:module.stripTypeScriptTypes()`. Most languages leave this undefined.
   *
   * @param source - Decoded module source.
   * @param location - Module file URL (for error messages).
   * @returns The (potentially rewritten) source string.
   */
  preProcessSource?: (source: string, location: string) => string;

  /**
   * Default record finalizer applied when the user does not supply one via
   * `PipelineConfig[language].finalizeRecord`.
   *
   * `cjs` ships a default that calls `buildCjsExecuteRecord`. All other
   * built-in languages leave this `undefined` because their worker-side
   * `PipelineRecord` is already a `FinalStaticModuleType`.
   */
  defaultFinalizeRecord?: RecordFinalizer<TLanguage>;
}

/**
 * Mapping of `PipelineLanguage` to its analysis context.
 * @internal
 */
type AnalysisContexts = {
  mjs: ModuleAnalysisContext;
  cjs: CjsAnalysisContext;
  mts: ModuleAnalysisContext;
};

/**
 * The complete, type-safe registry mapping every `PipelineLanguage` to its
 * {@link LanguageDefinition}.
 *
 * @internal
 */
export type LanguageRegistry = {
  readonly [K in PipelineLanguage]: Readonly<
    LanguageDefinition<K, AnalysisContexts[K]>
  >;
};

/**
 * Internal type for the final pipeline configuration.
 *
 * Each language's config uses the post-merge {@link FinalPipelineLanguageConfig}
 * shape (flat `visitorFactories`, optional `finalizeRecord`).
 *
 * `cjs` is optional because callers may opt out of CJS by omitting the `cjs`
 * block in their input — without a `finalizeRecord` there's no useful CJS
 * pipeline to build.
 *
 * @template TVisitorResults - Tuple type of user-defined visitor results.
 * @internal
 */

export interface FinalPipelineConfig<
  TVisitorResults extends readonly any[] = unknown[],
> {
  /** ESM-specific pipeline configuration (always present). */
  mjs: FinalPipelineLanguageConfig<MjsLanguage, TVisitorResults>;
  /** CJS-specific pipeline configuration (present when a `cjs` block was supplied). */
  cjs: FinalPipelineLanguageConfig<CjsLanguage, TVisitorResults>;
  /** ESM-TypeScript pipeline configuration (always present). */
  mts: FinalPipelineLanguageConfig<MtsLanguage, TVisitorResults>;
}
