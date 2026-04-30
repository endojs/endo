/**
 * Provides {@link definePipelineConfig}, which merges shared and per-language
 * user configuration into a {@link FinalPipelineConfig}.
 *
 * Language-specific defaults (e.g. the CJS record finalizer) are read from
 * the {@link LANGUAGES} registry.
 *
 * @module
 */

/**
 * @import {
 *   PipelineConfig,
 *   FinalPipelineLanguageConfig,
 *   PipelineLanguageConfig,
 *   PipelineLanguage,
 *   RecordFinalizer,
 *   VisitorPassFactory,
 * } from './types/pipeline.js'
 * @import {FinalPipelineConfig} from './types/internal.js'
 */

import { LANGUAGES } from './languages.js';

const { entries, fromEntries } = Object;

/**
 * Merges shared pipeline options with per-language overrides into a single
 * {@link FinalPipelineLanguageConfig}.
 *
 * Precedence (highest to lowest):
 *   1. Per-language value (from `perLangExtras`)
 *   2. Shared value (from `sharedFields`)
 *   3. Registry default (`defaultFinalize` for `finalizeRecord`)
 *
 * @template {PipelineLanguage} TLanguage
 * @template {readonly any[]} [TVisitorResults=unknown[]]
 * @param {PipelineLanguageConfig<TLanguage, TVisitorResults>} sharedFields
 * @param {Partial<FinalPipelineLanguageConfig<TLanguage, TVisitorResults>>} perLangExtras
 * @param {RecordFinalizer<TLanguage> | undefined} defaultFinalize
 * @returns {FinalPipelineLanguageConfig<TLanguage, TVisitorResults>}
 */
const mergePerLanguageConfig = (
  sharedFields,
  perLangExtras,
  defaultFinalize,
) => {
  const {
    visitorFactories: sharedVisitorFactories,
    onModuleComplete: sharedOnModuleComplete,
    onModuleStart: sharedOnModuleStart,
    onParseError: sharedOnParseError,
    babelParserOptions: sharedBabelParserOptions,
    babelGeneratorOptions: sharedBabelGeneratorOptions,
    log: sharedLog,
  } = sharedFields;

  const {
    visitorFactories: langVisitorFactories = [],
    onModuleComplete: langOnModuleComplete,
    onModuleStart: langOnModuleStart,
    onParseError: langOnParseError,
    babelParserOptions: langBabelParserOptions,
    babelGeneratorOptions: langBabelGeneratorOptions,
    log: langLog,
    finalizeRecord: langFinalizeRecord,
  } = perLangExtras;

  /**
   * @param {any} a
   * @param {any} b
   */
  const pick = (a, b) => a ?? b;

  return {
    visitorFactories: /** @type {VisitorPassFactory<unknown>[]} */ ([
      ...new Set([
        ...(sharedVisitorFactories ?? []),
        ...(langVisitorFactories ?? []),
      ]),
    ]),
    ...(pick(langOnModuleComplete, sharedOnModuleComplete)
      ? { onModuleComplete: pick(langOnModuleComplete, sharedOnModuleComplete) }
      : {}),
    ...(pick(langOnModuleStart, sharedOnModuleStart)
      ? { onModuleStart: pick(langOnModuleStart, sharedOnModuleStart) }
      : {}),
    ...(pick(langOnParseError, sharedOnParseError)
      ? { onParseError: pick(langOnParseError, sharedOnParseError) }
      : {}),
    ...(pick(langBabelParserOptions, sharedBabelParserOptions)
      ? {
          babelParserOptions: pick(
            langBabelParserOptions,
            sharedBabelParserOptions,
          ),
        }
      : {}),
    ...(pick(langBabelGeneratorOptions, sharedBabelGeneratorOptions)
      ? {
          babelGeneratorOptions: pick(
            langBabelGeneratorOptions,
            sharedBabelGeneratorOptions,
          ),
        }
      : {}),
    ...(pick(langLog, sharedLog) ? { log: pick(langLog, sharedLog) } : {}),
    finalizeRecord: langFinalizeRecord ?? defaultFinalize,
  };
};

/**
 * Merges shared and per-language user configuration into a
 * {@link FinalPipelineConfig} covering every registered language.
 *
 * Per-language overrides win over shared values; language registry defaults
 * (e.g. `defaultCjsFinalizeRecord` for CJS) fill in what neither provides.
 *
 * @template {readonly any[]} [TVisitorResults=unknown[]]
 * @param {PipelineConfig<TVisitorResults>} [extras]
 * @returns {FinalPipelineConfig<TVisitorResults>}
 * @internal
 */
export const definePipelineConfig = (extras = {}) => {
  const {
    visitorFactories: sharedVisitorFactories = [],
    onModuleComplete: sharedOnModuleComplete,
    onModuleStart: sharedOnModuleStart,
    onParseError: sharedOnParseError,
    babelParserOptions: sharedBabelParserOptions,
    babelGeneratorOptions: sharedBabelGeneratorOptions,
    log: sharedLog,
    ...perLanguageExtras
  } = extras;

  const sharedFields = {
    visitorFactories: sharedVisitorFactories,
    onModuleComplete: sharedOnModuleComplete,
    onModuleStart: sharedOnModuleStart,
    onParseError: sharedOnParseError,
    babelParserOptions: sharedBabelParserOptions,
    babelGeneratorOptions: sharedBabelGeneratorOptions,
    log: sharedLog,
  };

  return /** @type {FinalPipelineConfig<TVisitorResults>} */ (
    /** @type {unknown} */ (
      fromEntries(
        entries(LANGUAGES).map(([language, langDef]) => {
          const userExtras = perLanguageExtras[language] ?? {};
          return [
            language,
            mergePerLanguageConfig(
              sharedFields,
              userExtras,
              langDef.defaultFinalizeRecord,
            ),
          ];
        }),
      )
    )
  );
};
