/**
 * Types for {@link moduleSourceConfigs}.
 *
 * @module
 */

import type { GeneratorOptions } from '@babel/generator';
import type { ParseError, ParserOptions } from '@babel/parser';
import type { Visitor } from '@babel/traverse';
import type {
  AsyncParserImplementation,
  ParseOptions,
  ParseSourceMapHook,
  ParserImplementation,
} from '@endo/compartment-mapper';
import type { CjsModuleSourceRecord } from '@endo/module-source';
import type { FinalStaticModuleType } from 'ses';
import type {
  BABEL_SOURCE_TYPE_COMMONJS,
  BABEL_SOURCE_TYPE_MODULE,
  CJS_LANGUAGE,
  MJS_LANGUAGE,
  MTS_LANGUAGE,
} from '../constants.js';

/**
 * Function type that logs a message.
 */
export type LogFn = (...args: readonly any[]) => any;

/**
 * A single AST traversal pass that may optionally produce a result.
 *
 * Passes run in the order provided in `visitorFactories`, between the implicit
 * module-source analyzer (first) and the implicit module-source transform
 * (last). A pass may read the AST, mutate it, or both. If `done` is present it
 * is called immediately after that pass's own traversal, before the next pass
 * begins, so later passes see any mutations made by earlier ones.
 * begins, so later passes see any mutations made by earlier ones.
 *
 * @template TResult The type of data this pass produces via {@link done}.
 */
export interface VisitorPass<TResult = void> {
  /**
   * Visitor function that traverses the AST.
   */
  visitor: Visitor;

  /**
   * Retrieves results after this pass's traversal completes.
   *
   * Called immediately after the pass's own traversal, before any subsequent
   * pass runs. Omit when the pass produces no result.
   */
  done?(): TResult;
}

/**
 * Factory function that creates a fresh {@link VisitorPass} for each module.
 *
 * Called once per module before traversal begins. Each invocation must return
 * an instance with independent state so concurrent passes do not interfere.
 *
 * @template TResult The type of data the created pass produces.
 * @param location The module's file URL.
 * @param specifier The module specifier.
 * @returns A visitor pass
 */
export type VisitorPassFactory<TResult = void> = (
  location: string,
  specifier: string,
) => VisitorPass<TResult>;

/**
 * A {@link VisitorPassFactory} that can produce any type of result.
 */
export type AnyVisitorPassFactory = VisitorPassFactory<any>;

/**
 * Language for ES modules
 */
export type MjsLanguage = typeof MJS_LANGUAGE;

/**
 * Language for CommonJS modules
 */
export type CjsLanguage = typeof CJS_LANGUAGE;

/**
 * Language for ESM TypeScript modules.
 *
 * Sources are stripped of type annotations via Node.js'
 * `module.stripTypeScriptTypes()` before parsing; thereafter the pipeline
 * treats them as ESM. This implies the TS sources must adhere to erasable syntax onl.
 * @see {@link https://www.typescriptlang.org/tsconfig/#erasableSyntaxOnly}
 *
 */
export type MtsLanguage = typeof MTS_LANGUAGE;

/**
 * Union of source types
 */
export type PipelineLanguage = MjsLanguage | CjsLanguage | MtsLanguage;

/**
 * Valid Babel source types
 * @internal
 */
export type BabelSourceType =
  | typeof BABEL_SOURCE_TYPE_MODULE
  | typeof BABEL_SOURCE_TYPE_COMMONJS;

/**
 * `structuredClone`-compatible record produced by the pipeline's implicit
 * module-source analysis step and sent over IPC from worker to main thread.
 *
 * `mts` resolves to the same record shape as `mjs`; the TS-strip step happens
 * before parse and is invisible to the rest of the pipeline.
 *
 * @template TLanguage The type depends on the language.
 */
export type PipelineRecord<TLanguage extends PipelineLanguage> =
  TLanguage extends MjsLanguage | MtsLanguage
    ? FinalStaticModuleType
    : TLanguage extends CjsLanguage
      ? CjsModuleSourceRecord
      : never;

/**
 * A function that finalizes a {@link PipelineRecord} into a {@link FinalStaticModuleType}
 *
 * @template TLanguage The type depends on the language.
 */
export type RecordFinalizer<TLanguage extends PipelineLanguage> = (
  record: PipelineRecord<TLanguage>,
  location: string,
  packageLocation: string,
  parseOptions?: ParseOptions,
) => FinalStaticModuleType;

/**
 * Return value of {@link createParsers}.
 *
 * Both `sync` and `async` are drop-in replacements for the `parserForLanguage`
 * option in `@endo/compartment-mapper`.
 *
 */
export interface PipelinedParsers {
  /** Synchronous parsers: Babel parse-traverse-generate on the calling thread. */
  sync: Record<PipelineLanguage, ParserImplementation>;

  /**
   * Asynchronous parsers: work is dispatched to a lazy internal worker pool.
   *
   * The pool is created on first dereference. Workers are `worker.unref()`'d
   * so they never prevent Node.js from exiting cleanly once all in-flight
   * dispatches have settled.
   */
  async: Record<PipelineLanguage, AsyncParserImplementation>;
}

/**
 * User-supplied options for `@babel/parser` which do not conflict with
 * hardcoded options.
 *
 */
export type BabelParserOptions = Omit<
  ParserOptions,
  'tokens' | 'createParenthesizedExpressions' | 'sourceType' | 'errorRecovery'
>;

/**
 * User-supplied options for `@babel/generator` which do not conflict with
 * hardcoded options.
 *
 */
export type BabelGeneratorOptions = Omit<
  GeneratorOptions,
  | 'verbatim'
  | 'preserveFormat'
  | 'retainLines'
  | 'sourceMaps'
  | 'experimental_preserveFormat'
>;

/**
 * Function to call with parsing errors.
 *
 * Called at most once per module.
 *
 */
export type OnParseErrorFn = (errors: ParseError[]) => void;

/**
 * Options for {@link runPipelineInWorker}.
 */
export interface RunPipelineInWorkerOptions {
  /**
   * Optional function to log messages.
   */
  log?: LogFn;

  /**
   * Optional function to hook into the source map generation.
   */
  sourceMapHook?: ParseSourceMapHook;
}

/**
 * Per-language configuration overrides.
 *
 * @template TVisitorResults - Tuple type of user-defined visitor results.
 */
export interface PipelineLanguageConfig<
  TLanguage extends PipelineLanguage,
  TVisitorResults extends readonly any[] = unknown[],
> extends BasePipelineConfig<TVisitorResults> {
  /**
   * Main-thread finalizer for this language.
   *
   * Typically used for CJS to attach an `execute` closure, as well as providing
   * `__dirname` and `__filename` values.
   */
  finalizeRecord?: RecordFinalizer<TLanguage>;
}

/**
 * Output shape for a single language inside {@link FinalPipelineConfig}.
 *
 * Differs from {@link PipelineLanguageConfig} in that `visitorFactories`
 * is a homogeneous array rather than a tuple-mapped over `TVisitorResults`.
 * `definePipelineConfig` concatenates shared and per-language factories at
 * runtime, so the per-position typing of `TVisitorResults` no longer applies
 * to the merged result.
 *
 * @template TLanguage - The pipeline language.
 * @template TVisitorResults - Tuple type of user-defined visitor results
 *   (still threaded through `onModuleComplete`).
 */
export interface FinalPipelineLanguageConfig<
  TLanguage extends PipelineLanguage,
  TVisitorResults extends readonly any[] = unknown[],
> extends Omit<BasePipelineConfig<TVisitorResults>, 'visitorFactories'> {
  /** Merged visitor factories. Per-position typing is not preserved. */
  visitorFactories: VisitorPassFactory<unknown>[];

  /** Main-thread finalizer for this language. */
  finalizeRecord?: RecordFinalizer<TLanguage>;
}

/**
 * A function that is called after a module has been fully parsed, analyzed, and transformed.
 * @template TVisitorResults The type of the visitor results.
 */
export type OnModuleCompleteFn<
  TVisitorResults extends readonly any[] = unknown[],
> = (data: ModuleCompleteData<TVisitorResults>) => void;

/**
 * A function that is called before a module is parsed, analyzed, and transformed.
 * @param location The module's file URL.
 */
export type OnModuleStartFn = (location: string) => void;

/**
 * Base shape shared by {@link PipelineConfig} (top-level / shared) and
 * {@link PipelineLanguageConfig} (per-language `mjs`/`cjs` overrides).
 *
 * `TVisitorResults` is used solely to type the `visitorResults` argument
 * delivered to {@link OnModuleCompleteFn}. It does **not** statically constrain
 * the shape of the input `visitorFactories` array because that array is
 * concatenated at runtime from the shared and per-language slots; expressing
 * "shared ++ per-language === TVisitorResults" in TypeScript would entrain
 * a lot of conditional-type pain for little payoff. Callers who want typed
 * results in `onModuleComplete` should provide `TVisitorResults` explicitly
 * and ensure their factories produce values matching that tuple positionally.
 *
 * @template TVisitorResults - Tuple type of user-defined visitor results.
 */
export interface BasePipelineConfig<
  TVisitorResults extends readonly any[] = unknown[],
> {
  /**
   * Visitor pass factories. Top-level entries run on every language;
   * per-language entries (in `mjs`/`cjs`) run only for that language. The
   * pipeline concatenates the two arrays at runtime to form the per-module
   * factory list. Passes run in the order provided, between the implicit
   * module-source analyzer and the implicit module-source transform.
   */
  visitorFactories?: VisitorPassFactory<any>[];

  /**
   * Shared callback before processing starts (async path only).
   */
  onModuleStart?: OnModuleStartFn;

  /**
   * Shared callback after each module is fully processed.
   *
   * This is called _after_ {@link onParseError}.
   */
  onModuleComplete?: OnModuleCompleteFn<TVisitorResults>;

  /**
   * Shared callback called if a parsing a module results in `ParseError`s.
   *
   * This is called _before_ {@link onModuleComplete}.
   */

  onParseError?: OnParseErrorFn;

  /**
   * Options for `@babel/parser`.
   */
  babelParserOptions?: BabelParserOptions;

  /**
   * Options for `@babel/generator`.
   */
  babelGeneratorOptions?: BabelGeneratorOptions;

  /**
   * Logging function.
   */
  log?: LogFn;
}

/**
 * User-provided pipeline configuration provided to {@link createParsers}, and
 * {@link runPipelineInWorker}.
 *
 * Shared fields apply to all language configs. Per-language overrides in `mjs`
 * / `cjs` / `mts` are merged on top of the shared values (per-language wins
 * over shared).
 *
 * @template TVisitorResults - Tuple type of user-defined visitor results.
 */
export interface PipelineConfig<
  TVisitorResults extends readonly any[] = unknown[],
> extends BasePipelineConfig<TVisitorResults> {
  /** ESM-specific overrides. */
  mjs?: PipelineLanguageConfig<MjsLanguage, TVisitorResults>;

  /** CJS-specific overrides (commonly includes `finalizeRecord`). */
  cjs?: PipelineLanguageConfig<CjsLanguage, TVisitorResults>;

  /**
   * ESM-TypeScript-specific overrides.
   *
   * Sources are stripped of type annotations before parse; otherwise treated
   * as ESM. Requires Node.js v22.13.0 / v23.2.0+.
   */
  mts?: PipelineLanguageConfig<MtsLanguage, TVisitorResults>;
}

/**
 * Single configuration object accepted by {@link createParsers}.
 *
 * Extends {@link PipelineConfig} with pool/worker options. The four
 * pool-related fields are only meaningful when `.async` is dereferenced; they
 * are silently ignored for sync-only consumers.
 *
 * @template TVisitorResults - Tuple type of user-defined visitor results.
 */
export interface CreateParsersConfig<
  TVisitorResults extends readonly any[] = unknown[],
> extends PipelineConfig<TVisitorResults> {
  /**
   * URL of the consumer-provided worker script.
   *
   * Required only when `.async` is first dereferenced. Sync-only consumers
   * may omit it entirely.
   */
  workerScript?: URL | string;

  /** Serializable data passed to each worker via `workerData`. */
  workerData?: unknown;

  /** Maximum number of concurrent workers. Defaults to `availableParallelism() - 1`. */
  maxWorkers?: number;

  /** How long (ms) idle workers survive before termination. Defaults to 1000. */
  idleTimeout?: number;
}

/**
 * The subset of {@link BasePipelineConfig} fields that are meaningful inside a
 * worker thread: Babel options and factory arrays only.
 *
 * Lifecycle hooks (`onModuleStart`, `onModuleComplete`), `log`, and
 * `finalizeRecord` are main-thread concerns and are intentionally excluded.
 */
export type WorkerPipelineLanguageConfig = Pick<
  BasePipelineConfig,
  'visitorFactories' | 'babelParserOptions' | 'babelGeneratorOptions'
>;

/**
 * Configuration accepted by {@link runPipelineInWorker}.
 *
 * Restricts {@link PipelineConfig} to only the fields that workers actually
 * consume. Lifecycle hooks, loggers, and record finalizers are main-thread
 * concerns and are excluded — passing them would have no effect inside a
 * worker thread.
 */
export interface WorkerPipelineConfig extends WorkerPipelineLanguageConfig {
  /** ESM-specific Babel options and factory overrides. */
  mjs?: WorkerPipelineLanguageConfig;

  /** CJS-specific Babel options and factory overrides. */
  cjs?: WorkerPipelineLanguageConfig;

  /** ESM-TypeScript-specific Babel options and factory overrides. */
  mts?: WorkerPipelineLanguageConfig;
}

/**
 * Data passed to the `onModuleComplete` callback after a module has been fully
 * processed.
 *
 * @template TVisitorResults - Tuple type of visitor result types,
 *   positionally corresponding to the `visitorFactories` array.
 */
export interface ModuleCompleteData<
  TVisitorResults extends readonly any[] = unknown[],
> {
  /** The module's file URL. */
  location: string;
  /** The module specifier. */
  specifier: string;
  /** The language of the module (`'mjs'` or `'cjs'`). */
  language: PipelineLanguage;
  /**
   * Results from each visitor pass, in the same order as `visitorFactories`.
   * Passes that omit `done` contribute `undefined` to their slot.
   */
  visitorResults: TVisitorResults;
}
