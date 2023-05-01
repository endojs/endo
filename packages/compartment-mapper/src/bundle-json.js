import bundleCjs from './bundle-cjs.js';

/** quotes strings */
const q = JSON.stringify;

export default {
  runtime: bundleCjs.runtime,
  getBundlerKit: ({
      index,
      indexedImports,
      record: { jsonResult, location, exports: exportsList = [] },
    }) => {
      const source = `module.exports = ${q(jsonResult)}`
      const cjsWrappedSource = `(function (_, exports) { ${source} //*/\n})\n`;
      const cjsFunctor = `${cjsWrappedSource}//# sourceURL=${location}\n`;
      return bundleCjs.getBundlerKit({
        index,
        indexedImports,
        record: { cjsFunctor, exports: exportsList },
    });
  },
}