// @ts-check

import { parseLocatedJson } from './json.js';

const textDecoder = new TextDecoder();

const { freeze, keys, create } = Object;

function namespaceDefaultIsACopyOfRoot(namespace) {
  const ns = new Set(keys(namespace));
  const ds = new Set(['default'].concat(keys(namespace.default)));
  if (ns.size !== ds.size) return false;
  for (const a of ns) if (!ds.has(a)) return false;
  return true;
}

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
      create(compartment.globalThis.Object.prototype),
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
      if (
        // if cjs modules form a circular dependency and also mess with 'default', this may break
        namespace.default !== undefined &&
        // This is the closest we can get to checking if default was implicit. If someone sets default field to an
        // object with exactly the same fields as exported individually, it's probably safe to assume the values will
        // match as well.
        (keys(namespace).length === 1 ||
          namespaceDefaultIsACopyOfRoot(namespace))
      ) {
        return namespace.default;
      }

      // namespace.constructor === Object is false in Endo and true in Node.
      // If we want it fixed, need to wrap with a proxy or make a copy here.
      return namespace;
    });

    functor(
      require,
      finalExports,
      module,
      location, // __filename
      locationParent(location), // __dirname
    );

    const exportsHaveBeenOverwritten = finalExports !== originalExports;
    if (!exportsHaveBeenOverwritten) {
      // If the proxy is still there, all of the fields were collected, so we need a copy of moduleEnvironmentRecord
      // This will not work for non-enumerable properties, but how would moduleEnvironmentRecord get any?
      finalExports = Object.assign(
        create(compartment.globalThis.Object.prototype),
        moduleEnvironmentRecord,
      );
    }

    moduleEnvironmentRecord.default = finalExports;

    // Promotes keys from default to top level namespace for import *
    // Note: We could do it less consistently but closer to how node does it if we iterated over exports detected by
    // the lexer.
    if (exportsHaveBeenOverwritten) {
      keys(moduleEnvironmentRecord.default).forEach(k => {
        if (k !== 'default')
          moduleEnvironmentRecord[k] = moduleEnvironmentRecord.default[k];
      });
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
