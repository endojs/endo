// @ts-check

import { StaticModuleRecord } from '@endo/static-module-record';

const textDecoder = new TextDecoder();

/**
 * @param {string} rel - a relative URL
 * @param {string} abs - a fully qualified URL
 * @returns {string}
 */
const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

export const scheduleError = error => {
  // throw right away, postponing errors is for CJS
  throw error;
};

/**
 * @param {import('./types.js').ReadFn} read
 * @returns {Promise<import('./types.js').StaticModuleType>}
 * 
 */
export const readAndParse = async (
  read,
  moduleSpecifier,
  packageLocation,
) => {
  // No candidate conventions need to be used in ESM
  const moduleLocation = resolveLocation(moduleSpecifier, packageLocation);
  // eslint-disable-next-line no-await-in-loop
  const bytes = read(moduleLocation).catch(_error => undefined);


  if (!bytes) {
    return scheduleError(
      // TODO offer breadcrumbs in the error message, or how to construct breadcrumbs with another tool.
      new Error(
        `Cannot find file for internal module ${q(
          moduleSpecifier,
        )}`,
      ),
    );
  }
  
  if (transforms) {
    ({ bytes, parser: language } = await transforms(
      bytes,
      specifier,
      location,
      packageLocation,
    ));
  }

  return parseMjs(bytes, specifier, location, packageLocation);
};

/** @type {import('./types.js').ParseFn} */
export const parseMjs = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const source = textDecoder.decode(bytes);
  const record = new StaticModuleRecord(source, location);
  return {
    parser: 'mjs',
    bytes,
    record,
  };
};
