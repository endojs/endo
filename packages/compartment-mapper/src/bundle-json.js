/* Provides JSON support for `bundle.js`. */

const textDecoder = new TextDecoder();

export default {
  runtime: '',
  getBundlerKit({ index, indexedImports, bytes }) {
    // Round-trip to revalidate JSON and squeeze out space.
    const json = JSON.stringify(JSON.parse(textDecoder.decode(bytes)));
    return {
      getFunctor: () => `\
// === functors[${index}] ===
(set) => set(${json}),
`,
      getCells: () => `\
    { default: cell('default') },
`,
      getReexportsWiring: () => '',
      getFunctorCall: () => `\
  functors[${index}](cells[${index}].default.set);
`,
    };
  },
};
