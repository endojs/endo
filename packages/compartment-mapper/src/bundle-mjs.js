/** quotes strings */
const q = JSON.stringify;

const importsCellSetter = (exportMap, index) =>
  ''.concat(
    ...Object.entries(exportMap).map(
      ([exportName, [importName]]) => `\
      ${importName}: cells[${index}].${exportName}.set,
`,
    ),
  );

const importImplementation = indexedImports => {
  const knownEntries = Object.entries(indexedImports);
  if (knownEntries.length === 0) {
    return `imports() {},`;
  }
  return `\
imports(entries) {
      const map = new Map(entries);
      observeImports(map, [
  ${''.concat(
    ...knownEntries.map(
      ([importName, importIndex]) => `\
    [${q(importName)}, ${importIndex}],
  `,
    ),
  )}\
    ]);},`;
};

const getReexportKeys = reexportMap => {
  if (!reexportMap) {
    return {};
  }
  return Object.values(reexportMap)
    .flat()
    .map(([local, _exported]) => local);
};

// vvv runtime to inline in the bundle vvv
/* eslint-disable no-undef */
function observeImports(map, pairs) {
  for (const [importName, importIndex] of pairs) {
    for (const [name, observers] of map.get(importName)) {
      const cell = cells[importIndex][name];
      if (cell === undefined) {
        throw new ReferenceError(`Cannot import name ${name}`);
      }
      for (const observer of observers) {
        cell.observe(observer);
      }
    }
  }
}

/* eslint-enable no-undef */

const runtime = `\
${observeImports}`;
// ^^^ runtime to inline in the bundle ^^^

export default {
  runtime,
  getBundlerKit(
    {
      index,
      indexedImports,
      record: {
        __syncModuleProgram__,
        __fixedExportMap__ = {},
        __liveExportMap__ = {},
        __reexportMap__ = {},
        __needsImportMeta__ = false,
        reexports,
      },
    },
    { __removeSourceURL = false } = {},
  ) {
    if (__removeSourceURL) {
      __syncModuleProgram__ = `${__syncModuleProgram__}`.replace(
        /\/\/# sourceURL=.*/,
        '',
      );
    }
    return {
      getFunctor: () => `\
// === functors[${index}] ===
${__syncModuleProgram__},
`,
      getCells: () => [
        ...Object.keys(__fixedExportMap__),
        ...Object.keys(__liveExportMap__),
        ...getReexportKeys(__reexportMap__),
      ],
      reexportedCells: reexports.map(importSpecifier => [
        index,
        indexedImports[importSpecifier],
      ]),
      getReexportsWiring: () => {
        const mappings = [];
        // Create references for export name as newname
        const namedReexportsToProcess = Object.entries(__reexportMap__);
        if (namedReexportsToProcess.length > 0) {
          mappings.push(`
  Object.defineProperties(cells[${index}], {${namedReexportsToProcess.map(
            ([specifier, renames]) => {
              return renames.map(
                ([localName, exportedName]) =>
                  `${q(exportedName)}: { value: cells[${
                    indexedImports[specifier]
                  }][${q(localName)}] }`,
              );
            },
          )} });
`);
        }
        return mappings.join('');
      },
      getFunctorCall: () => `\
  functors[${index}]({
    ${importImplementation(indexedImports)}
    liveVar: {
  ${importsCellSetter(__liveExportMap__, index)}\
  },
    onceVar: {
${importsCellSetter(__fixedExportMap__, index)}\
    },\
${__needsImportMeta__ ? '\n    importMeta: {},' : ''}
  });
`,
    };
  },
};
