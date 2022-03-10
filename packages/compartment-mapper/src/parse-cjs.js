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
   * @param {Object} moduleEnvironmentRecord
   * @param {Compartment} compartment
   * @param {Record<string, string>} resolvedImports
   */
  const execute = (moduleEnvironmentRecord, compartment, resolvedImports) => {
    const functor = compartment.evaluate(
      `(function (require, exports, module, __filename, __dirname) { ${source} //*/\n})\n//# sourceURL=${location}`,
    );

    const originalExports = new Proxy(
      Object.create(compartment.globalThis.Object.prototype),
      {
        get(target, prop) {
          // this makes things like exports.hasOwnProperty() work.
          return moduleEnvironmentRecord[prop] || target[prop];
        },
        set(target, prop, value) {
          moduleEnvironmentRecord[prop] = value;
          return true;
        },
      },
    );

    let finalExports = originalExports;

    const module = freeze({
      get exports() {
        return finalExports;
      },
      set exports(value) {
        finalExports = value;
      },
    });

    const require = freeze((/** @type {string} */ importSpecifier) => {
      const namespace = compartment.importNow(resolvedImports[importSpecifier]);
      if (namespace.default !== undefined) {
        if (Object.keys(namespace).length > 1) {
          // This resembles Node's behavior more closely.
          // When originalExports get overwritten with finalExports, all exports get collected in the default field.
          // While it works fine for the import case, when you require a module with its exports handled that way, it
          // doesn't behave like require would. Returning namespace.default would match the expected behavior exactly,
          // but would break the packages actually exporting a default key as their only export. This is a compromise
          // that decently handles the edge case. A more precise solution capable of differentiating between the actual
          // default export and the syntetic default export may be possible.
          return { ...namespace.default, ...namespace };
        } else {
          return namespace.default;
        }
      }
      return namespace;
    });

    functor(
      require,
      finalExports,
      module,
      location, // __filename
      new URL('./', location).toString(), // __dirname
    );
    if (finalExports !== originalExports) {
      moduleEnvironmentRecord.default = finalExports;
    }
  };

  return {
    parser: 'cjs',
    bytes,
    record: freeze({ imports, exports, reexports, execute }),
  };
};

/** @type {import('./types.js').ParserImplementation} */
export default {
  parse: parseCjs,
  heuristicImports: true,
};
