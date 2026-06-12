/**
 * Provides {@link createParsers}, the primary entry point for the
 * `@endo/parser-pipeline` package.
 *
 * @module
 */

/**
 * @import {FinalStaticModuleType} from 'ses'
 * @import {
 *   AsyncParseFn,
 *   ParseFn,
 *   AsyncParserImplementation,
 *   ParserImplementation,
 * } from '@endo/compartment-mapper'
 * @import {
 *   CjsLanguage,
 *   PipelinedParsers,
 *   PipelineLanguage,
 *   PipelineRecord,
 *   RecordFinalizer,
 *   AnyVisitorPassFactory,
 *   CreateParsersConfig,
 *   PipelineConfig,
 *   PipelineLanguageConfig,
 * } from './types/pipeline.js'
 * @import {PipelineConfigForCjs} from './types/internal.js'
 */

import { identity, noop } from './constants.js';
import { LANGUAGES } from './languages.js';
import { definePipelineConfig } from './pipeline-config.js';
import { runPipeline } from './run-pipeline.js';
import { WorkerParserPool } from './worker-pool.js';

const { freeze, entries, fromEntries } = Object;

/**
 * Creates a single synchronous `ParserImplementation` from a
 * {@link PipelineConfigForCjs}.
 *
 * The pipeline implicitly handles module-source analysis and record building
 * based on `config.sourceType`. User-defined `visitorFactories` run between
 * the implicit steps.
 * @overload
 * @param {CjsLanguage} language
 * @param {PipelineConfigForCjs<any>} config
 * @returns {ParserImplementation}
 * @internal
 */

/**
 * Creates a single synchronous `ParserImplementation` from a
 * {@link PipelineConfigWithLanguage}.
 *
 * The pipeline implicitly handles module-source analysis and record building
 * based on `config.sourceType`. User-defined `visitorFactories` run between
 * the implicit steps.
 * @template {PipelineLanguage} TLanguage
 * @overload
 * @param {TLanguage} language
 * @param {PipelineLanguageConfig<TLanguage, any>} config
 * @returns {ParserImplementation}
 * @internal
 */

/**
 * Creates a single synchronous `ParserImplementation` from a
 * {@link PipelineConfigWithLanguage}.
 *
 * The pipeline implicitly handles module-source analysis and record building
 * based on `config.sourceType`. User-defined `visitorFactories` run between
 * the implicit steps.
 * @template {PipelineLanguage} TLanguage
 * @param {TLanguage} language
 * @param {PipelineLanguageConfig<TLanguage, any>} config
 * @returns {ParserImplementation}
 * @internal
 */
const createSyncParserFromConfig = (language, config) => {
  const {
    visitorFactories = /** @type {AnyVisitorPassFactory[]} */ ([]),
    finalizeRecord,
    onModuleComplete = noop,
    onModuleStart = noop,
    babelParserOptions: parserOptions,
    babelGeneratorOptions: generatorOptions,
    onParseError = noop,
  } = config;

  const { heuristicImports } = LANGUAGES[language];

  /** @type {ParseFn} */
  const parse = (
    bytes,
    specifier,
    location,
    packageLocation,
    parseOptions = {},
  ) => {
    onModuleStart(location);

    const { sourceMapHook } = parseOptions;

    const {
      transformedBytes,
      visitorResults,
      record: rawRecord,
      errors,
    } = runPipeline({
      bytes,
      specifier,
      location,
      language,
      visitorFactories,
      parserOptions,
      generatorOptions,
      sourceMapHook,
    });

    if (errors?.length) {
      onParseError(errors);
    }

    onModuleComplete({ location, specifier, language, visitorResults });

    // We narrow through `unknown` so that the conditional
    // `PipelineRecord<TLanguage>` type resolves correctly for the finalizer.
    const workerRecord = /** @type {PipelineRecord<TLanguage>} */ (
      /** @type {unknown} */ (rawRecord)
    );
    const record = finalizeRecord
      ? finalizeRecord(workerRecord, location, packageLocation, parseOptions)
      : /** @type {FinalStaticModuleType} */ (workerRecord);

    return { parser: language, bytes: transformedBytes, record };
  };

  parse.isSyncParser = true;

  return freeze({ parse, heuristicImports, synchronous: true });
};

/**
 * Creates a single async `AsyncParserImplementation` for a language, backed by
 * a shared {@link WorkerParserPool}.
 *
 * @overload
 * @param {CjsLanguage} language
 * @param {PipelineLanguageConfig<CjsLanguage, any>} config
 * @param {WorkerParserPool<any>} pool
 * @returns {AsyncParserImplementation}
 * @internal
 */

/**
 * Creates a single async `AsyncParserImplementation` for a language, backed by
 * a shared {@link WorkerParserPool}.
 *
 * @template {PipelineLanguage} TLanguage
 * @overload
 * @param {TLanguage} language
 * @param {PipelineLanguageConfig<TLanguage, any>} config
 * @param {WorkerParserPool<any>} pool
 * @returns {AsyncParserImplementation}
 * @internal
 */

/**
 * Creates a single async `AsyncParserImplementation` for a language, backed by
 * a shared {@link WorkerParserPool}.
 *
 * @template {PipelineLanguage} TLanguage
 * @param {TLanguage} language
 * @param {PipelineLanguageConfig<TLanguage, any>} config
 * @param {WorkerParserPool<any>} pool
 * @internal
 */
const createAsyncParserFromConfig = (language, config, pool) => {
  const {
    finalizeRecord,
    onModuleStart = noop,
    onModuleComplete = noop,
    onParseError = noop,
  } = config;

  const { heuristicImports, defaultFinalizeRecord } = LANGUAGES[language];

  // Resolve the record finalizer in precedence order:
  //   1. User-supplied finalizeRecord (from PipelineConfig[language])
  //   2. Language registry default (e.g. defaultCjsFinalizeRecord for cjs)
  //   3. Identity (safe only when the worker record is already FinalStaticModuleType)
  const buildFinalRecord = /** @type {RecordFinalizer<TLanguage>} */ (
    finalizeRecord ?? defaultFinalizeRecord ?? identity
  );

  /** @type {AsyncParseFn} */
  const parse = async (
    bytes,
    specifier,
    location,
    packageLocation,
    parseOptions,
  ) => {
    onModuleStart(location);

    const message = await pool.dispatch(
      bytes,
      specifier,
      location,
      packageLocation,
      language,
    );
    const { visitorResults, parseErrors } = message;
    // The pool is language-agnostic, but we know `language` here, so narrow
    // the dispatched record into a `PipelineRecord<TLanguage>` for the
    // finalizer. (Two-step cast through `unknown` because TS's overlap check
    // can't see the conditional type's branches without instantiation.)
    const record = /** @type {PipelineRecord<TLanguage>} */ (
      /** @type {unknown} */ (message.record)
    );

    if (parseErrors?.length) {
      onParseError(parseErrors);
    }

    onModuleComplete({ location, specifier, language, visitorResults });

    const finalRecord = buildFinalRecord(
      record,
      location,
      packageLocation,
      parseOptions,
    );

    return { parser: language, bytes, record: finalRecord };
  };

  parse.isSyncParser = false;

  return freeze({ parse, heuristicImports, synchronous: false });
};

/**
 * Builds a pair of `{ sync, async }` parser maps from a single configuration
 * object.
 *
 * Both maps are drop-in replacements for the `parserForLanguage` option in
 * `@endo/compartment-mapper`.
 *
 * - **`sync`**: All parsing runs on the calling thread. Suitable for the
 *   execution path where dynamic `require()` demands synchronous parsing.
 *   Lazily-built.
 * - **`async`**: Each parse call is dispatched to a lazily-created worker pool.
 *   Workers are `worker.unref()`'d so they never prevent Node.js from exiting
 *   once in-flight dispatches settle.
 *
 * The module-source analysis step (imports/exports discovery, functor
 * construction) is handled implicitly per language by the pipeline; consumers
 * do not need to include it in `visitorFactories`.
 *
 * Pool/worker options (`workerScript`, `workerData`, `maxWorkers`,
 * `idleTimeout`) are accepted at the top level alongside pipeline config fields.
 * `workerScript` is only required when `.async` is first dereferenced;
 * sync-only consumers may omit it.
 *
 * @template {readonly any[]} [TVisitorResults=unknown[]] Tuple type of
 * user-defined visitor results.
 * @param {CreateParsersConfig<TVisitorResults>} [config]
 * @returns {PipelinedParsers}
 */
export const createParsers = (config = {}) => {
  const {
    workerScript,
    workerData,
    maxWorkers,
    idleTimeout,
    ...pipelineConfig
  } = config;

  const finalConfig = definePipelineConfig(
    /** @type {PipelineConfig<TVisitorResults>} */ (pipelineConfig),
  );

  /** @type {Record<PipelineLanguage, ParserImplementation> | undefined} */
  let syncMap;

  /** @returns {Record<PipelineLanguage, ParserImplementation>} */
  const getSyncParsers = () => {
    if (syncMap) {
      return syncMap;
    }
    syncMap = /** @type {Record<PipelineLanguage, ParserImplementation>} */ (
      freeze(
        fromEntries(
          entries(finalConfig).map(([language, langConfig]) => {
            const lang = /** @type {PipelineLanguage} */ (language);
            return [lang, createSyncParserFromConfig(lang, langConfig)];
          }),
        ),
      )
    );
    return syncMap;
  };

  /** @type {Record<PipelineLanguage, AsyncParserImplementation> | undefined} */
  let asyncMap;

  /** @type {WorkerParserPool<any> | undefined} */
  let asyncPool;

  /** @returns {Record<PipelineLanguage, AsyncParserImplementation>} */
  const getAsyncParsers = () => {
    if (asyncMap) {
      return asyncMap;
    }
    if (!workerScript) {
      throw new Error(
        'createParsers: workerScript option required to create async parser',
      );
    }

    asyncPool = new WorkerParserPool(workerScript, {
      workerData,
      maxWorkers,
      idleTimeout,
    });

    asyncMap =
      /** @type {Record<PipelineLanguage, AsyncParserImplementation>} */ (
        freeze(
          fromEntries(
            entries(finalConfig).map(([language, langConfig]) => [
              language,
              createAsyncParserFromConfig(
                /** @type {PipelineLanguage} */ (language),
                langConfig,
                /** @type {WorkerParserPool<any>} */ (asyncPool),
              ),
            ]),
          ),
        )
      );

    return asyncMap;
  };

  return {
    get sync() {
      return getSyncParsers();
    },
    get async() {
      return getAsyncParsers();
    },
  };
};
