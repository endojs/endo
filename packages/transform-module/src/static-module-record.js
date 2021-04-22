/* eslint no-underscore-dangle: ["off"] */

import babel from '@agoric/babel-standalone';
import { makeModuleAnalyzer } from './transform-analyze.js';

const { freeze, keys } = Object;

const analyzeModule = makeModuleAnalyzer(babel);

/**
 * StaticModuleRecord captures the effort of parsing and analyzing module text
 * so a cache of StaticModuleRecords may be shared by multiple Compartments.
 *
 * @class
 * @param {string} source
 * @param {string} [url]
 */
export function StaticModuleRecord(source, url = '<unknown>') {
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
  } = analyzeModule({ string: source, url });
  this.imports = freeze([...keys(imports)].sort());
  this.exports = freeze(
    [...keys(liveExportMap), ...keys(fixedExportMap)].sort(),
  );
  this.reexports = freeze([...exportAlls].sort());
  this.__syncModuleProgram__ = functorSource;
  this.__liveExportMap__ = liveExportMap;
  this.__fixedExportMap__ = fixedExportMap;
  freeze(this);
}
