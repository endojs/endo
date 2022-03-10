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
          // default export and the synthetic default export may be possible.
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

/** @type {import('./types.js').ParserImplementation} */
export default {
  parse: parsePreCjs,
  heuristicImports: true,
};
