/**
 * Types for the `@endo/parser-pipeline` composable AST pipeline.
 *
 * @module
 */

import type { GeneratorOptions } from '@babel/generator';
import type { Visitor } from '@babel/traverse';
import type { ParserOptions } from '@babel/parser';
import type { AsyncParserImplementation } from '@endo/compartment-mapper';
import type { FinalStaticModuleType } from 'ses';

/**
 * A read-only analysis pass that extracts data from the AST without mutation.
 *
 * Analyzers run before transforms. Their visitors should not mutate AST nodes.
 *
 * @template TResult - The type of data this analyzer produces.
 */
export interface AnalyzerPass<TResult> {
  readonly visitor: Visitor;

  /**
   * Retrieves the analysis results after traversal completes.
   *
   * Must be called after the pipeline has finished traversing the AST.
   */
  getResults(): TResult;
}

/**
 * A mutating transform pass that rewrites AST nodes in place.
 *
 * Transforms run after all analyzers have completed.
 */
export interface TransformPass {
  readonly visitor: Visitor;
}

/**
 * Factory function that creates a fresh {@link AnalyzerPass} for each module.
 *
 * Called once per module before traversal begins. Each invocation must return
 * an instance with independent state so concurrent analyses do not interfere.
 *
 * @template TResult - The type of data the created analyzer produces.
 * @param location - The module's file URL.
 * @param specifier - The module specifier.
 */
export type AnalyzerFactory<TResult> = (
  location: string,
  specifier: string,
) => AnalyzerPass<TResult>;

/**
 * Factory function that creates a fresh {@link TransformPass} for each module.
 *
 * @param location - The module's file URL.
 * @param specifier - The module specifier.
 */
export type TransformFactory = (
  location: string,
  specifier: string,
) => TransformPass;

/**
 * Data passed to the {@link ComposedParserOptions.onModuleComplete} callback
 * after a module has been fully analyzed and transformed.
 *
 * @template TAnalyzerResults - Tuple type of analyzer result types,
 *   positionally corresponding to the `analyzerFactories` array.
 */
export interface ModuleCompleteData<
  TAnalyzerResults extends readonly unknown[],
> {
  /** The module's file URL. */
  readonly location: string;
  /** The module specifier. */
  readonly specifier: string;
  /**
   * Results from each analyzer, in the same order as `analyzerFactories`.
   */
  readonly analyzerResults: TAnalyzerResults;
}

/**
 * Builds a module record from generated code and analysis data.
 *
 * Called after all visitors have run and code has been generated. The returned
 * object becomes the `record` field of the `ParseFn` return value.
 *
 * @param generatedCode - The code produced by `@babel/generator`.
 * @param location - The module's file URL.
 */
export type RecordBuilder = (
  generatedCode: string,
  location: string,
) => FinalStaticModuleType;

/**
 * Optional configuration for the composed parser pipeline.
 *
 * The generic parameter maps analyzer factories to their result types so that
 * `onModuleComplete` receives a well-typed tuple of results.
 *
 * @template TAnalyzerResults - Tuple of result types from analyzers.
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
 */
export interface ComposedParserOptions<
  TAnalyzerResults extends readonly any[] = unknown[],
> {
  /**
   * Factories that create read-only analysis visitors.
   *
   * Each factory is called once per module and must return an
   * {@link AnalyzerPass} with fresh, independent state.
   */
  readonly analyzerFactories?: {
    [K in keyof TAnalyzerResults]: AnalyzerFactory<TAnalyzerResults[K]>;
  };

  /**
   * Factories that create mutating transform visitors.
   *
   * Transforms run after all analyzers. Order matters: earlier transforms
   * see the AST before later transforms mutate it.
   */
  readonly transformFactories?: readonly TransformFactory[];

  /**
   * Optional function to pre-process the source string before Babel parsing.
   *
   * Use this for lightweight string-level transforms that must happen before
   * AST construction (e.g., hashbang removal, direct eval evasion).
   */
  readonly sourcePreprocessor?: (source: string) => string;

  /**
   * Called after each module is fully analyzed and transformed, before the
   * pipeline returns to compartment-mapper.
   *
   * Use this to collect analysis results (e.g., globals maps, violations).
   */
  readonly onModuleComplete?: (
    data: ModuleCompleteData<TAnalyzerResults>,
  ) => void;

  /**
   * Optional options to pass to `@babel/generator`.
   */
  readonly babelGeneratorOptions?: GeneratorOptions;

  /**
   * Optional options to pass to `@babel/parser`.
   */
  readonly babelParserOptions?: ParserOptions;

  /**
   * Optional function to log messages
   *
   * @internal
   */
  readonly log?: (...args: unknown[]) => void;

  /**
   * Expected source type for the parser.
   *
   * Defaults to `'mjs'`
   */
  readonly sourceType?: 'mjs' | 'cjs';

  // TODO: Add CJS analyzer/transform factory support here when replacing
  // the hand-written CJS lexer with Babel AST parsing.
}

// ---- Worker protocol types ----

/**
 * Message sent from the main thread to a worker to request parsing.
 */
export interface WorkerParseMessage {
  type: 'parse';
  id: string;
  bytes: Uint8Array;
  specifier: string;
  location: string;
  packageLocation: string;
}

/**
 * Message sent from a worker back to the main thread with parse results.
 */
export interface WorkerResultMessage {
  type: 'result';
  id: string;
  record: FinalStaticModuleType;
  bytes: Uint8Array;
  analyzerResults: unknown[];
}

/**
 * Message sent from a worker back to the main thread on error.
 *
 * The `error` property is the original `Error` instance (or a wrapper),
 * preserved via `structuredClone`.
 */
export interface WorkerErrorMessage {
  type: 'error';
  id: string;
  error: Error;
}

/**
 * Union of all messages a worker can send back.
 */
export type WorkerResponseMessage = WorkerResultMessage | WorkerErrorMessage;

/**
 * Options for {@link createWorkerParser}.
 */
export interface WorkerParserOptions<
  TAnalyzerResults extends readonly unknown[] = unknown[],
> {
  /**
   * Called after each module is fully processed in a worker.
   */
  onModuleComplete?: (data: ModuleCompleteData<TAnalyzerResults>) => void;

  /**
   * Maximum number of concurrent workers.
   *
   * Defaults to `os.availableParallelism() - 1` (minimum 1).
   */
  maxWorkers?: number;

  /**
   * How long (ms) idle workers survive before termination. Defaults to `1000`.
   */
  idleTimeout?: number;

  /**
   * Data passed to each worker at spawn time via `workerData`.
   *
   * Must be structuredClone-able. Use this for serializable configuration
   * (e.g., ignoredRefs, builtinModules) that the worker script needs.
   */
  workerData?: unknown;

  /**
   * Optional function to log messages
   */
  log?: (...args: unknown[]) => void;
}

/**
 * Creates transform passes for a given module. Called once per parse task.
 *
 * Must also return the module-source analyzer pass (which shares state with
 * the transform) and the record builder.
 */
export type CreateTransformPassesFn = (
  location: string,
  specifier: string,
) => {
  passes: TransformPass[];
  analyzerPass: AnalyzerPass<unknown>;
  buildRecord: RecordBuilder;
};

/**
 * Creates analyzer passes for a given module. Called once per parse task.
 */
export type CreateAnalyzerPassesFn = (
  location: string,
  specifier: string,
) => AnalyzerPass<unknown>[];

/**
 * Configuration for {@link runPipelineInWorker}.
 *
 * The worker script provides these callbacks to wire up its visitor pipeline.
 */
export interface WorkerPipelineConfig {
  /**
   * Creates analyzer passes for a given module. Called once per parse task.
   */
  createAnalyzerPasses: CreateAnalyzerPassesFn;

  /**
   * Creates transform passes for a given module. Called once per parse task.
   *
   * Must also return the module-source analyzer pass (which shares state with
   * the transform) and the record builder.
   */
  createTransformPasses: CreateTransformPassesFn;

  /**
   * Optional pre-parse source string transform.
   */
  sourcePreprocessor?: (source: string) => string;
}

/**
 * A parser implementation that can be terminated.
 *
 * @todo This should probably instead be `Disposable` when we are guaranteed
 * support.
 */
export type TerminatableAsyncParserImplementation =
  AsyncParserImplementation & {
    terminate: () => Promise<void>;
  };
