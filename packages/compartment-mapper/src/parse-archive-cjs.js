// @ts-check

/** @typedef {import('ses').ThirdPartyStaticModuleInterface} ThirdPartyStaticModuleInterface */

import { analyzeCommonJS } from '@endo/cjs-module-analyzer';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const { freeze } = Object;

const noopExecute = () => {};
freeze(noopExecute);

/** @type {import('./types.js').ParseFn} */
export const parseArchiveCjs = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const source = textDecoder.decode(bytes);

  if (typeof location !== 'string') {
    throw new TypeError(
      `Cannot create CommonJS static module record, module location must be a string, got ${location}`,
    );
  }

  const { requires: imports, exports, reexports } = analyzeCommonJS(
    source,
    location,
  );

  const pre = textEncoder.encode(
    JSON.stringify({
      imports,
      exports,
      reexports,
      source: `(function (require, exports, module, __filename, __dirname) { ${source} //*/\n})\n//# sourceURL=${location}`,
    }),
  );

  return {
    parser: 'pre-cjs-json',
    bytes: pre,
    record: /** @type {ThirdPartyStaticModuleInterface} */ (freeze({
      imports: freeze(imports),
      exports: freeze(exports),
      reexports: freeze(reexports),
      execute: noopExecute,
    })),
  };
};
