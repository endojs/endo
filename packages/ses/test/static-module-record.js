/* eslint no-underscore-dangle: ["off"] */

import babel from '@agoric/babel-standalone';
import { makeModuleAnalyzer } from '@agoric/transform-module';
import { freeze, keys } from '../src/commons.js';

const analyzeModule = makeModuleAnalyzer(babel);

/*
 * StaticModuleRecord captures the effort of parsing and analyzing module text
 * so a cache of StaticModuleRecords may be shared by multiple Compartments.
 */
export function StaticModuleRecord(string, url) {
  const {
    imports,
    functorSource,
    liveExportMap,
    fixedExportMap,
    exportAlls,
  } = analyzeModule({ string, url });
  return freeze({
    imports: freeze([...keys(imports)].sort()),
    exports: freeze([...keys(liveExportMap), ...keys(fixedExportMap)]),
    reexports: freeze([...exportAlls]),
    __syncModuleProgram__: functorSource,
    __liveExportMap__: liveExportMap,
    __fixedExportMap__: fixedExportMap,
  });
}
