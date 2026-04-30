/* eslint-disable no-underscore-dangle */
/**
 * Provides {@link buildCjsExecuteRecord}, a function that converts a
 * {@link CjsModuleSourceRecord} into a {@link FinalStaticModuleType}.
 *
 * For use with `@endo/parser-pipeline`'s `createComposedParser()`.
 *
 * @module
 */

import { getModulePaths, wrap } from './parse-cjs-shared-export-wrapper.js';

/**
 * @import {CjsModuleSourceRecord} from '@endo/module-source'
 * @import {ReadFn, ReadPowers} from './types.js'
 * @import {FinalStaticModuleType} from 'ses'
 */

const { freeze } = Object;

/**
 * Converts a {@link CjsModuleSourceRecord} (which has a `cjsFunctor` string)
 * into a `FinalStaticModuleType`-compatible record (which has an `execute`
 * function). This is the bridge between the composed-pipeline CJS analysis and
 * the compartment-mapper execution model.
 *
 * Used by both {@link parseCjsBabel} (single-shot parser) and
 * {@link createCjsExecParser} (composed-pipeline parser) so the execution
 * logic lives in exactly one place.
 *
 * @param {CjsModuleSourceRecord} cjsRecord
 * @param {string} location
 * @param {ReadFn | ReadPowers | undefined} readPowers
 * @returns {FinalStaticModuleType}
 */

export const buildCjsExecuteRecord = (cjsRecord, location, readPowers) => {
  const { filename, dirname } = getModulePaths(readPowers, location);

  /**
   * @param {object} moduleEnvironmentRecord
   * @param {Compartment} compartment
   * @param {Record<string, string>} resolvedImports
   */
  const execute = (moduleEnvironmentRecord, compartment, resolvedImports) => {
    const functor = compartment.evaluate(cjsRecord.cjsFunctor);

    const wrapResult = wrap({
      moduleEnvironmentRecord,
      compartment,
      resolvedImports,
      location,
      readPowers,
    });

    const args = [
      wrapResult.require,
      wrapResult.moduleExports,
      wrapResult.module,
      filename,
      dirname,
    ];

    if (cjsRecord.__needsImport__ && wrapResult.importFn) {
      args.push(wrapResult.importFn);
    }

    functor.call(wrapResult.moduleExports, ...args);

    wrapResult.afterExecute();
  };

  return freeze({
    imports: cjsRecord.imports,
    exports: cjsRecord.exports,
    reexports: cjsRecord.reexports,
    execute,
  });
};
