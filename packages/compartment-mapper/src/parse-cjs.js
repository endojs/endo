// @ts-check

import { analyzeCommonJS } from '@endo/cjs-module-analyzer';

const textDecoder = new TextDecoder();

const { apply } = Reflect;
const { freeze, keys, create, hasOwnProperty } = Object;

/**
 * @param {Object} object
 * @param {string} key
 * @returns {boolean}
 */
const has = (object, key) => apply(hasOwnProperty, object, [key]);

function namespaceDefaultIsACopyOfRoot(namespace) {
  const ns = new Set(keys(namespace));
  const ds = new Set(['default'].concat(keys(namespace.default)));
  if (ns.size !== ds.size) return false;
  for (const a of ns) if (!ds.has(a)) return false;
  return true;
}

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

  if (!exports.includes('default')) {
    exports.push('default');
  }

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
      create(compartment.globalThis.Object.prototype),
      {
        get(target, prop) {
          // this makes things like exports.hasOwnProperty() work.
          return moduleEnvironmentRecord[prop] || target[prop];
        },
        set(_target, prop, value) {
          moduleEnvironmentRecord[prop] = value;
          return true;
        },
        defineProperty(_target, prop, descriptor) {
          // Object.defineProperty(moduleEnvironmentRecord, prop, descriptor) would work if someone in the npm
          // community didn't come up with the idea to redefine property in the getter.
          if (has(descriptor, 'value')) {
            // This will result in non-enumerable properties being enumerable, but it's better than undefined
            moduleEnvironmentRecord[prop] = descriptor.value;
          } else {
            // Running the getter defeats some lazy initialization tricks.
            // Whoever depends on getters on exports for lazy init instead
            // of factory functions should face the consequences.
            moduleEnvironmentRecord[prop] = descriptor.get
              ? descriptor.get()
              : undefined;
          }
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
      new URL('./', location).toString(), // __dirname
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
