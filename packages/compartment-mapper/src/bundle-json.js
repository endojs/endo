export default {
  runtime: '',
  getBundlerKit({ index, record: { sourceText } }) {
    return {
      getFunctor: () => `\
// === functors[${index}] ===
${sourceText},
`,
      getCells: () => `\
    { default: cell('default') }, 
`,
      getReexportsWiring: () => '',
      getFunctorCall: () => `\
  cells[${index}].default.set(functors[${index}]);
`,
    };
  },
};
