/* eslint no-underscore-dangle: ["off"] */

import { makeModuleAnalyzer } from './transform-analyze.js';

const { freeze, keys, values } = Object;

// If all ESM implementations were correct, it would be sufficient to
// `import babel` instead of `import * as babel`.
// However, the `node -r esm` emulation of ESM produces a linker error,
// claiming there is no export named default.
// Also, the behavior of `import * as babel` changes from Node.js 14 to 16.
// Node.js 14 produces an extraneous { default } wrapper around the exports
// namespace and 16 introduces lexical static analysis of exported names, so
// comes closer to correct, and at least consistent with `node -r esm`.
//
// Node.js 14:
//   NESM:
//     babel:     exports
//     babelStar: { default: exports }
//   RESM:
//     babel:     linker error: no export named default
//     babelStar: exports
// Node.js 16:
//   NESM:
//     babel:     exports
//     babelStar: exports + trash
//   RESM:
//     babel:     linker error: no export named default
//     babelStar: exports

const analyzeModule = makeModuleAnalyzer();

/**
 * @callback SourceMapHook
 * @param {string} sourceMap
 * @param {string} sourceUrl
 * @param {string} source
 */

/**
 * @typedef {object} Options
 * @property {string} [sourceUrl]
 * @property {string} [sourceMap]
 * @property {string} [sourceMapUrl]
 * @property {SourceMapHook} [sourceMapHook]
 */

/**
 * StaticModuleRecord captures the effort of parsing and analyzing module text
 * so a cache of StaticModuleRecords may be shared by multiple Compartments.
 *
 * @class
 * @param {string} source
 * @param {string | Options} [opts]
 * @returns {import('ses').PrecompiledStaticModuleInterface}
 */
export function StaticModuleRecord(source, opts = {}) {
  if (new.target === undefined) {
    throw TypeError(
      "Class constructor StaticModuleRecord cannot be invoked without 'new'",
    );
  }
  if (typeof opts === 'string') {
    opts = { sourceUrl: opts };
  }
  const {
    imports,
    functorSource,
    liveExportMap,
    reexportMap,
    fixedExportMap,
    exportAlls,
    needsImportMeta,
  } = analyzeModule(source, opts);
  this.imports = freeze([...keys(imports)]);
  this.exports = freeze(
    [
      ...keys(liveExportMap),
      ...keys(fixedExportMap),
      ...values(reexportMap).flatMap(([_, exportName]) => exportName),
    ].sort(),
  );
  this.reexports = freeze([...exportAlls].sort());
  this.__syncModuleProgram__ = functorSource;
  this.__liveExportMap__ = liveExportMap;
  this.__reexportMap__ = reexportMap;
  this.__fixedExportMap__ = fixedExportMap;
  this.__needsImportMeta__ = needsImportMeta;
  freeze(this);
}
