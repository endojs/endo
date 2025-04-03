/**
 * Provides language behavior for analyzing, pre-compiling, and storing
 * CommonJS modules for an archive.
 *
 * @module
 */

/** @import {ParseFn} from './types.js' */

import { analyzeCommonJS } from '@endo/cjs-module-analyzer';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** @type {<T>(value: T) => T} */
const freeze = Object.freeze;

const noopExecute = () => {};
freeze(noopExecute);

/** @type {ParseFn} */
export const parseArchiveCjs = (
  bytes,
  _specifier,
  location,
  _packageLocation,
  options = {},
) => {
  const source = textDecoder.decode(bytes);

  const { archiveOnly = false } = options;

  const {
    requires: imports,
    exports,
    reexports,
  } = analyzeCommonJS(source, location);

  if (!exports.includes('default')) {
    exports.push('default');
  }

  let cjsFunctor = `(function (require, exports, module, __filename, __dirname) { 'use strict'; ${source} //*/\n})\n`;

  const pre = textEncoder.encode(
    JSON.stringify({
      imports,
      exports,
      reexports,
      source: cjsFunctor,
    }),
  );

  if (!archiveOnly) {
    cjsFunctor = `${cjsFunctor}//# sourceURL=${location}\n`;
  }

  return {
    parser: 'pre-cjs-json',
    bytes: pre,
    record: /** @type {import('ses').ThirdPartyStaticModuleInterface} */ (
      freeze({
        imports: freeze(imports),
        exports: freeze(exports),
        reexports: freeze(reexports),
        execute: noopExecute,
        cjsFunctor,
      })
    ),
  };
};

/** @type {import('./types.js').ParserImplementation} */
export default {
  parse: parseArchiveCjs,
  heuristicImports: true,
  synchronous: true,
};
