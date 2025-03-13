/* Provides CommonJS support for `bundle.js`. */

/** @import {VirtualModuleSource} from 'ses' */
/** @import {BundlerSupport} from './bundle-lite.js' */

/** @typedef {VirtualModuleSource & {cjsFunctor: string}} CjsModuleSource */

import { join } from './node-module-specifier.js';

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
function wrapCjsFunctor(index, functor) {
  /* eslint-disable no-undef */
  return ({ imports = {} }) => {
    const moduleCells = cells[index];
    const cModule = freeze(
      defineProperty({}, 'exports', moduleCells.default),
    );
    // TODO: specifier not found handling
    const requireImpl = specifier => cells[imports[specifier]].default.get();
    functor(freeze(requireImpl), cModule.exports, cModule);
    // Update all named cells from module.exports.
    const names = keys(moduleCells);
    for (let i = 0; i < names.length; i += 1) {
      const name = names[i];
      if (name !== 'default' && name !== '*') {
        moduleCells[name].set(cModule.exports[name]);
      }
    }
    // Add new named cells from module.exports.
    const exportNames = keys(cModule.exports);
    for (let i = 0; i < exportNames.length; i += 1) {
      const name = exportNames[i];
      if (name !== 'default' && name !== '*' && moduleCells[name] === undefined) {
        moduleCells[name] = cell(name, cModule.exports[name]);
      }
    }
    // Update the star cell from all cells.
    const starExports = create(null, {
      // Make this appear like an ESM module namespace object.
      [Symbol.toStringTag]: {
        value: 'Module',
        writable: false,
        enumerable: false,
        configurable: false,
      },
    });
    const allNames = keys(moduleCells);
    for (let i = 0; i < allNames.length; i += 1) {
      const name = allNames[i];
      if (name !== '*') {
        defineProperty(starExports, name, moduleCells[name]);
      }
    }
    moduleCells['*'].set(freeze(starExports));
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
      moduleSpecifier,
      sourceDirname,
      record: { cjsFunctor, exports: exportsList = {} },
    },
    { useEvaluate = false },
  ) {
    const importsMap = JSON.stringify(indexedImports);

    let functor = cjsFunctor;
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
${exportsCellRecord(exportsList)}\
    },
`,
      getReexportsWiring: () => '',
      getFunctorCall: () => {
        let functorExpression = `functors[${index}]`;
        if (useEvaluate) {
          functorExpression = `evaluateSource(...${functorExpression})`;
        }
        return `\
  wrapCjsFunctor(${index}, ${functorExpression})({imports: ${importsMap}});
`;
      },
    };
  },
};
