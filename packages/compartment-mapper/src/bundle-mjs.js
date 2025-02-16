/* Provides ESM support for `bundle.js`. */

/** @import {PrecompiledModuleSource} from 'ses' */
/** @import {BundlerSupport} from './bundle-lite.js' */

import { join } from './node-module-specifier.js';

/** quotes strings */
const q = JSON.stringify;

const exportsCellRecord = exportMap =>
  ''.concat(
    ...Object.keys(exportMap).map(
      exportName => `\
      ${exportName}: cell(${q(exportName)}),
`,
    ),
  );

const importsCellSetter = (exportMap, index) =>
  ''.concat(
    ...Object.entries(exportMap).map(
      ([exportName, [importName]]) => `\
      ${importName}: cells[${index}].${exportName}.set,
`,
    ),
  );

const adaptReexport = reexportMap => {
  if (!reexportMap) {
    return {};
  }
  const ret = Object.fromEntries(
    Object.values(reexportMap)
      .flat()
      .map(([local, exported]) => [exported, [local]]),
  );
  return ret;
};

export const runtime = `\
function observeImports(map, importName, importIndex) {
  for (const [name, observers] of map.get(importName)) {
    const cell = cells[importIndex][name];
    if (cell === undefined) {
      throw new ReferenceError(\`Cannot import name \${name} (has \${Object.getOwnPropertyNames(cells[importIndex]).join(', ')})\`);
    }
    for (const observer of observers) {
      cell.observe(observer);
    }
  }
}
`;

/** @type {BundlerSupport<PrecompiledModuleSource>} */
export default {
  runtime,
  getBundlerKit(
    {
      index,
      indexedImports,
      moduleSpecifier,
      sourceDirname,
      record: {
        __syncModuleProgram__,
        __fixedExportMap__ = {},
        __liveExportMap__ = {},
        __reexportMap__ = {},
        reexports,
      },
    },
    { useEvaluate = false },
  ) {
    let functor = __syncModuleProgram__;
    if (useEvaluate) {
      const sourceUrl = join(sourceDirname, moduleSpecifier);
      functor = JSON.stringify([functor, sourceUrl]);
    }
    return {
      getFunctor: () => `\
${functor},
`,
      getCells: () => `\
    {
${exportsCellRecord(__fixedExportMap__)}${exportsCellRecord(
        __liveExportMap__,
      )}${exportsCellRecord(adaptReexport(__reexportMap__))}\
    },
`,
      getReexportsWiring: () => {
        const mappings = reexports.map(
          importSpecifier => `\
  defineProperties(cells[${index}], getOwnPropertyDescriptors(cells[${indexedImports[importSpecifier]}]));
`,
        );
        // Create references for export name as newname
        const namedReexportsToProcess = Object.entries(__reexportMap__);
        if (namedReexportsToProcess.length > 0) {
          mappings.push(`
  defineProperties(cells[${index}], {${namedReexportsToProcess.map(
    ([specifier, renames]) => {
      return renames.map(
        ([localName, exportedName]) =>
          `${q(exportedName)}: { value: cells[${indexedImports[specifier]}][${q(
            localName,
          )}] }`,
      );
    },
  )} });
`);
        }
        return mappings.join('');
      },
      getFunctorCall: () => {
        let functorExpression = `functors[${index}]`;
        if (useEvaluate) {
          functorExpression = `evaluateSource(...${functorExpression})`;
        }
        return `\
  ${functorExpression}({
    imports(entries) {
      const map = new Map(entries);
  ${''.concat(
    ...Object.entries(indexedImports).map(
      ([importName, importIndex]) => `\
    observeImports(map, ${q(importName)}, ${importIndex});
  `,
    ),
  )}\
  },
    liveVar: {
  ${importsCellSetter(__liveExportMap__, index)}\
  },
    onceVar: {
${importsCellSetter(__fixedExportMap__, index)}\
    },
    importMeta: {},
  });
`;
      },
    };
  },
};
