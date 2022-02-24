// @ts-check

import { parseLocatedJson } from './json.js';

const { freeze } = Object;

const textDecoder = new TextDecoder();

const locationParent = location => {
  const index = location.lastIndexOf('/');
  if (index >= 0) {
    return location.slice(0, index);
  }
  return location;
};

/** @type {import('./types.js').ParseFn} */
export const parsePreCjs = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const text = textDecoder.decode(bytes);
  const { source, imports, exports, reexports } = parseLocatedJson(
    text,
    location,
  );

  /**
   * @param {Object} moduleEnvironmentRecord
   * @param {Compartment} compartment
   * @param {Record<string, string>} resolvedImports
   */
  const execute = (moduleEnvironmentRecord, compartment, resolvedImports) => {
    const functor = compartment.evaluate(source);

    const originalExports = new Proxy(
      Object.create(compartment.globalThis.Object.prototype),
      {
        get(target, prop) {
          return moduleEnvironmentRecord[prop] || target[prop]; // this makes things like exports.hasOwnProperty() work.
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
        return namespace.default;
      }
      return namespace;
    });

    functor(
      require,
      finalExports,
      module,
      location, // __filename
      locationParent(location), // __dirname
    );
    if (finalExports !== originalExports) {
      moduleEnvironmentRecord.default = finalExports;
    }
  };

  return {
    parser: 'pre-cjs-json',
    bytes,
    record: {
      imports,
      reexports,
      exports,
      execute,
    },
  };
};
