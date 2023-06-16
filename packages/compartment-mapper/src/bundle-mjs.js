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
      throw new ReferenceError(\`Cannot import name \${name}\`);
    }
    for (const observer of observers) {
      cell.observe(observer);
    }
  }
}
`;

export default {
  runtime,
  getBundlerKit({
    index,
    indexedImports,
    record: {
      __syncModuleProgram__,
      __fixedExportMap__ = {},
      __liveExportMap__ = {},
      __reexportMap__ = {},
      reexports,
    },
  }) {
    return {
      getFunctor: () => `\
// === functors[${index}] ===
${__syncModuleProgram__}
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
  Object.defineProperties(cells[${index}], Object.getOwnPropertyDescriptors(cells[${indexedImports[importSpecifier]}]));
`,
        );
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
`,
    };
  },
};
