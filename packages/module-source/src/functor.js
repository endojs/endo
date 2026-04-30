/**
 * Shared logic for building the SES functor source string and assembling
 * the frozen module record (see {@link ModuleSourceRecord}).
 *
 * @module
 */

import * as h from './hidden.js';

/**
 * @import {ModuleSourceRecord} from './types/module-source.js'
 */

const { keys, values, freeze: objectFreeze } = Object;

/**
 * It's {@link objectFreeze | Object.freeze} without the `Readonly`!
 *
 * @privateRemarks Remove this if we decide to make the fields of `PrecompiledModuleSource` readonly.
 */
const freeze = /** @type {<T>(v: T) => T} */ (objectFreeze);

const { stringify: js } = JSON;

/**
 * Builds the SES functor source string from generated code and the analysis
 * state accumulated during the analyzer and transform passes.
 *
 * Constructs the `$h_imports([...])` preamble from `sourceOptions.importSources`,
 * `importDecls`, and `hoistedDecls`, then wraps `scriptSource` in the SES
 * functor calling convention.
 *
 * @param {string} scriptSource The code produced by `@babel/generator`
 *   after all transform passes.
 * @param {Record<string, any>} sourceOptions The mutable state bag populated
 *   by `makeModulePlugins`.
 * @param {string} [sourceUrl] The source URL for the module.
 * @returns {string} The functor source string.
 */
export const buildFunctorSource = (scriptSource, sourceOptions, sourceUrl) => {
  const isrc = sourceOptions.importSources;

  let preamble = sourceOptions.importDecls.join(',');
  if (preamble !== '') {
    preamble = `let ${preamble};`;
  }

  preamble += `${h.HIDDEN_IMPORTS}([${keys(isrc)
    .map(
      src =>
        `[${js(src)}, [${Object.entries(isrc[src])
          .map(([exp, upds]) => `[${js(exp)},[${upds.join(',')}]]`)
          .join(',')}]]`,
    )
    .join(',')}]);`;

  preamble += sourceOptions.hoistedDecls
    .map(([vname, isOnce, cvname]) => {
      let src = '';
      if (cvname) {
        src = `Object.defineProperty(${cvname},'name',{value:${js(vname)}});`;
      }
      const hDeclId = isOnce ? h.HIDDEN_ONCE : h.HIDDEN_LIVE;
      src += `${hDeclId}.${vname}(${cvname || ''});`;
      return src;
    })
    .join('');

  let functorSource = `\
({imports:${h.HIDDEN_IMPORTS},liveVar:${h.HIDDEN_LIVE},onceVar:${h.HIDDEN_ONCE},import:${h.HIDDEN_IMPORT},importMeta:${h.HIDDEN_META}})=>(function(){'use strict';\
${preamble}\
${scriptSource}
})()
`;

  if (sourceUrl) {
    functorSource += `//# sourceURL=${sourceUrl}\n`;
  }

  return functorSource;
};

/**
 * Computes the derived arrays (`imports`, `exports`, `reexports`) from the
 * raw maps in `sourceOptions` and assembles a {@link ModuleSourceRecord}.
 *
 * @param {Record<string, any>} sourceOptions The mutable state bag populated
 *   by `makeModulePlugins`.
 * @param {string} functorSource The functor source string from
 *   {@link buildFunctorSource}.
 * @returns {ModuleSourceRecord}
 */
export const buildModuleRecord = (sourceOptions, functorSource) => {
  for (const entry of values(sourceOptions.liveExportMap)) {
    freeze(entry);
  }
  for (const entry of values(sourceOptions.fixedExportMap)) {
    freeze(entry);
  }
  for (const reexports of values(sourceOptions.reexportMap)) {
    for (const pair of reexports) {
      freeze(pair);
    }
    freeze(reexports);
  }

  return freeze({
    imports: freeze([...keys(sourceOptions.imports)]),
    exports: freeze(
      [
        ...keys(sourceOptions.liveExportMap),
        ...keys(sourceOptions.fixedExportMap),
        ...values(sourceOptions.reexportMap)
          .flat()
          .map(([_, exportName]) => exportName),
      ].sort(),
    ),
    reexports: freeze([...sourceOptions.exportAlls].sort()),
    __syncModuleProgram__: functorSource,
    __liveExportMap__: freeze(sourceOptions.liveExportMap),
    __fixedExportMap__: freeze(sourceOptions.fixedExportMap),
    __reexportMap__: freeze(sourceOptions.reexportMap),
    __needsImport__: sourceOptions.dynamicImport.present,
    __needsImportMeta__: sourceOptions.importMeta.present,
  });
};
