// vvv runtime to inline in the bundle vvv
/* eslint-disable no-undef */
// This function is serialized and references variables from its destination scope.
function wrapCjsFunctor(num) {
  return ({ imports = {} }) => {
    const cModule = Object.freeze(
      Object.defineProperty({}, 'exports', cells[num].default),
    );
    // TODO: specifier not found handling
    const requireImpl = specifier => cells[imports[specifier]].default.get();
    functors[num](Object.freeze(requireImpl), cModule.exports, cModule);
    Object.keys(cells[num])
      .filter(k => k !== 'default' && k !== '*')
      .map(k => cells[num][k].set(cModule.exports[k]));
  };
}
/* eslint-enable no-undef */
const runtime = `\
${wrapCjsFunctor}`;
// ^^^ runtime to inline in the bundle ^^^

export default {
  runtime,
  getBundlerKit({
    index,
    indexedImports,
    record: { cjsFunctor, exports: exportsList = {} },
  }) {
    const importsMap = JSON.stringify(indexedImports);

    return {
      getFunctor: () => `\
// === functors[${index}] ===
${cjsFunctor},
`,
      getCells: () => exportsList,
      getReexportsWiring: () => '',
      getFunctorCall: () => `\
  wrapCjsFunctor(${index})({imports: ${importsMap}});
`,
    };
  },
};
