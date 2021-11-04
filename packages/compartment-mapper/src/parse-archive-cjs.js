// @ts-check

/** @typedef {import('ses').ThirdPartyStaticModuleInterface} ThirdPartyStaticModuleInterface */

import { analyzeCommonJS } from '@endo/cjs-module-analyzer';
import { join } from './node-module-specifier.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const { freeze } = Object;

const noopExecute = () => {};
freeze(noopExecute);

/** @type {import('./types.js').ParseFn} */
export const parseArchiveCjs = async (
  bytes,
  specifier,
  _location,
  _packageLocation,
  packageName,
) => {
  const source = textDecoder.decode(bytes);
  const base = packageName
    .split('/')
    .slice(-1)
    .join('/');
  const sourceLocation = `.../${join(base, specifier)}`;

  const { requires: imports, exports, reexports } = analyzeCommonJS(
    source,
    sourceLocation,
  );

  const pre = textEncoder.encode(
    JSON.stringify({
      imports,
      exports,
      reexports,
      source: `(function (require, exports, module, __filename, __dirname) { ${source} //*/\n})\n//# sourceURL=${sourceLocation}`,
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
