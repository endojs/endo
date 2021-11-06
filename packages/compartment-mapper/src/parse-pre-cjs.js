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
      locationParent(location), // __dirname
    );
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
