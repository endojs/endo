/* Provides CommonJS support for `bundle.js`. */

/** @import {VirtualModuleSource} from 'ses' */
/** @import {BundlerSupport} from './bundle.js' */

/** @typedef {VirtualModuleSource & {cjsFunctor: string}} CjsModuleSource */

/** quotes strings */
const q = JSON.stringify;

const exportsCellRecord = exportsList =>
  ''.concat(
    ...exportsList.map(
      exportName => `\
      ${q(exportName)}: cell(${q(exportName)}${
        exportName !== 'default' ? '' : `, {}`
      }),
`,
    ),
  );

// This function is serialized and references variables from its destination scope.
const runtime = `\
function wrapCjsFunctor(num) {
  /* eslint-disable no-undef */
  return ({ imports = {} }) => {
    const moduleCells = cells[num];
    const cModule = Object.freeze(
      Object.defineProperty({}, 'exports', moduleCells.default),
    );
    // TODO: specifier not found handling
    const requireImpl = specifier => cells[imports[specifier]].default.get();
    functors[num](Object.freeze(requireImpl), cModule.exports, cModule);
    // Update all named cells from module.exports.
    Object.keys(moduleCells)
      .filter(k => k !== 'default' && k !== '*')
      .map(k => moduleCells[k].set(cModule.exports[k]));
    // Add new named cells from module.exports.
    Object.keys(cModule.exports)
      .filter(k => k !== 'default' && k !== '*')
      .filter(k => moduleCells[k] === undefined)
      .map(k => (moduleCells[k] = cell(k, cModule.exports[k])));
    // Update the star cell from all cells.
    const starExports = Object.create(null, {
      // Make this appear like an ESM module namespace object.
      [Symbol.toStringTag]: {
        value: 'Module',
        writable: false,
        enumerable: false,
        configurable: false,
      },
    });
    Object.keys(moduleCells)
      .filter(k => k !== '*')
      .map(k => Object.defineProperty(starExports, k, moduleCells[k]));
    moduleCells['*'].set(Object.freeze(starExports));
  };
  /* eslint-enable no-undef */
}`;

/** @type {BundlerSupport<CjsModuleSource>} */
export default {
  runtime,
  getBundlerKit(
    {
      index,
      indexedImports,
      record: { cjsFunctor, exports: exportsList = {} },
    },
    { useNamedEvaluate = undefined },
  ) {
    const importsMap = JSON.stringify(indexedImports);

    return {
      getFunctor:
        useNamedEvaluate !== undefined
          ? () => `\
// === functors[${index}] ===
${useNamedEvaluate}(${JSON.stringify(cjsFunctor)}),
`
          : () => `\
// === functors[${index}] ===
${cjsFunctor},
`,
      getCells: () => `\
    {
${exportsCellRecord(exportsList)}\
    },
`,
      getReexportsWiring: () => '',
      getFunctorCall: () => `\
  wrapCjsFunctor(${index})({imports: ${importsMap}});
`,
    };
  },
};
