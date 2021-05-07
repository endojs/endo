// @ts-check

import { analyzeCommonJS } from '@endo/cjs-module-analyzer';
import { encodeSyrup } from '@endo/syrup/encode';

const textDecoder = new TextDecoder();

const { freeze } = Object;

/** @type {ParseFn} */
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

  const pre = encodeSyrup({
    imports,
    exports,
    reexports,
    source: `(function (require, exports, module, __filename, __dirname) { ${source} //*/\n})\n//# sourceURL=${location}`,
  });

  return {
    parser: 'precjs',
    bytes: pre,
    record: freeze({ imports, exports, reexports }),
  };
};
