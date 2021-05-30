// @ts-check
/// <reference types="ses"/>

import { analyzeCommonJS } from '@endo/cjs-module-analyzer';

const textDecoder = new TextDecoder();

const { freeze } = Object;

/** @type {ParseFn} */
export const parseCjs = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const source = textDecoder.decode(bytes);

  const { requires: imports, exports, reexports } = analyzeCommonJS(
    source,
    location,
  );

  /**
   * @param {Object} moduleExports
   * @param {Compartment} compartment
   * @param {Record<string, string>} resolvedImports
   */
  const execute = async (moduleExports, compartment, resolvedImports) => {
    const functor = compartment.evaluate(
      `(function (require, exports, module, __filename, __dirname) { ${source} //*/\n})\n//# sourceURL=${location}`,
    );

    const module = freeze({
      get exports() {
        return moduleExports;
      },
      set exports(value) {
        moduleExports.default = value;
      },
    });

    const require = freeze((/** @type {string} */ importSpecifier) => {
      const namespace = compartment.importNow(resolvedImports[importSpecifier]);
      if (namespace.default !== undefined) {
        return namespace.default;
      }
      return namespace;
    });

    functor(
      require,
      moduleExports,
      module,
      location, // __filename
      new URL('./', location).toString(), // __dirname
    );
  };

  return {
    parser: 'cjs',
    bytes,
    record: freeze({ imports, exports, reexports, execute }),
  };
};
