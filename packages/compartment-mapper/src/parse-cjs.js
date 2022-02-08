// @ts-check

import { analyzeCommonJS } from '@endo/cjs-module-analyzer';

const textDecoder = new TextDecoder();

const { freeze } = Object;

/** @type {import('./types.js').ParseFn} */
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
  const execute = (moduleExports, compartment, resolvedImports) => {
    const functor = compartment.evaluate(
      `(function (require, exports, module, __filename, __dirname) { ${source} //*/\n})\n//# sourceURL=${location}`,
    );

    const exportsDoubleProxy = new Proxy(
      {},
      {
        get(target, prop) {
          return moduleExports[prop] || target[prop]; // this makes things like exports.hasOwnProperty() work. Does it break hardening though?
        },
        set(target, prop, value) {
          moduleExports[prop] = value;
          return true;
        },
      },
    );

    let exportsReferenceCopy = exportsDoubleProxy;

    const module = freeze({
      get exports() {
        return exportsReferenceCopy;
      },
      set exports(value) {
        exportsReferenceCopy = value;
      },
    });

    const require = freeze((/** @type {string} */ importSpecifier) => {
      const namespace = compartment.importNow(resolvedImports[importSpecifier]);
      if (namespace.default !== undefined) {
        if (Object.keys(namespace).length > 1) {
          return { ...namespace.default, ...namespace }; // this resembles Node's behavior more closely
        } else {
          return namespace.default;
        }
      }
      return namespace;
    });

    functor(
      require,
      exportsReferenceCopy,
      module,
      location, // __filename
      new URL('./', location).toString(), // __dirname
    );
    if (exportsReferenceCopy !== exportsDoubleProxy) {
      moduleExports.default = exportsReferenceCopy;
    }
  };

  return {
    parser: 'cjs',
    bytes,
    record: freeze({ imports, exports, reexports, execute }),
  };
};
