// @ts-check

import { decodeSyrup } from '@endo/syrup/decode';

const { freeze } = Object;

/** @type {ParseFn} */
export const parsePreCjs = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const { source, imports, exports, reexports } = decodeSyrup(bytes, {
    name: location,
  });

  /**
   * @param {Object} moduleExports
   * @param {Compartment} compartment
   * @param {Record<string, string>} resolvedImports
   */
  const execute = async (moduleExports, compartment, resolvedImports) => {
    const functor = compartment.evaluate(source);

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
    parser: 'precjs',
    bytes,
    record: {
      imports,
      reexports,
      exports,
      execute,
    },
  };
};
