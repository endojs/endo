// @ts-check

import { analyzeCommonJS } from '@endo/cjs-module-analyzer';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** @type {<T>(value: T) => T} */
const freeze = Object.freeze;

const noopExecute = () => {};
freeze(noopExecute);

/** @type {import('./types.js').ParseFn} */
export const parseArchiveCjs = (
  bytes,
  specifier,
  location,
  _packageLocation,
) => {
  const source = textDecoder.decode(bytes);

  const {
    requires: imports,
    exports,
    reexports,
  } = analyzeCommonJS(source, location);

  if (!exports.includes('default')) {
    exports.push('default');
  }

  const cjsWrappedSource = `(function (require, exports, module, __filename, __dirname) { ${source} //*/\n})\n`;

  const pre = textEncoder.encode(
    JSON.stringify({
      imports,
      exports,
      reexports,
      source: cjsWrappedSource,
    }),
  );

  const cjsFunctor = `${cjsWrappedSource}//# sourceURL=${location}\n`;

  return {
    parser: 'pre-cjs-json',
    bytes: pre,
    record: /** @type {import('ses').ThirdPartyStaticModuleInterface} */ (
      freeze({
        imports: freeze(imports),
        exports: freeze(exports),
        reexports: freeze(reexports),
        execute: noopExecute,
        cjsFunctor,
      })
    ),
  };
};

/** @type {import('./types.js').ParserImplementation} */
export default {
  parse: parseArchiveCjs,
  heuristicImports: true,
};
