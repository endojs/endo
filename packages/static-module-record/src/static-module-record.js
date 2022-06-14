/* eslint no-underscore-dangle: ["off"] */

import { makeModuleAnalyzer } from './transform-analyze.js';

const { freeze, keys } = Object;

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
 * StaticModuleRecord captures the effort of parsing and analyzing module text
 * so a cache of StaticModuleRecords may be shared by multiple Compartments.
 *
 * @class
 * @param {string} source
 * @param {string} [url]
 * @returns {import('ses').PrecompiledStaticModuleInterface}
 */
export function StaticModuleRecord(source, url) {
  if (new.target === undefined) {
    throw new TypeError(
      "Class constructor StaticModuleRecord cannot be invoked without 'new'",
    );
  }
  const {
    imports,
    functorSource,
    liveExportMap,
    fixedExportMap,
    exportAlls,
    needsImportMeta,
  } = analyzeModule({ string: source, url });
  this.imports = freeze([...keys(imports)].sort());
  this.exports = freeze(
    [...keys(liveExportMap), ...keys(fixedExportMap)].sort(),
  );
  this.reexports = freeze([...exportAlls].sort());
  this.__syncModuleProgram__ = functorSource;
  this.__liveExportMap__ = liveExportMap;
  this.__fixedExportMap__ = fixedExportMap;
  this.__needsImportMeta__ = needsImportMeta;
  freeze(this);
}
