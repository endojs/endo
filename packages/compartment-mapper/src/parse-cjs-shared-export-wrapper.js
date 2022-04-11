// @ts-check
const { apply } = Reflect;
const { freeze, keys, create, hasOwnProperty } = Object;

/**
 * @param {Object} object
 * @param {string} key
 * @returns {boolean}
 */
const has = (object, key) => apply(hasOwnProperty, object, [key]);

/**
 * ModuleEnvironmentRecord wrapper
 * Creates shared export processing primitives to be used both Location and Archive usecases of cjs
 *
 * @param {Object} moduleEnvironmentRecord
 * @param {Compartment} compartment
 * @param {Record<string, string>} resolvedImports
 * @returns {{
 *   module: { exports: any },
 *   moduleExports: any,
 *   afterExecute: Function,
 *   require: Function,
 * }}
 */
export const wrap = (moduleEnvironmentRecord, compartment, resolvedImports) => {
  // This initial default value makes things like exports.hasOwnProperty() work in cjs.
  moduleEnvironmentRecord.default = create(
    compartment.globalThis.Object.prototype,
  );

  // Set all exported properties on the defult and on the namespace simultaneously for import *
  // Root namespace is only accessible for imports. Requiring from cjs gets the default field of the namespace
  const assignProp = (prop, value) => {
    //  __esModule needs to be present for typescript-compiled modules to work, can't be skipped
    if (prop !== 'default') {
      moduleEnvironmentRecord[prop] = value;
    }
    moduleEnvironmentRecord.default[prop] = value;
  };

  const originalExports = new Proxy(moduleEnvironmentRecord.default, {
    set(_target, prop, value) {
      assignProp(prop, value);
      return true;
    },
    defineProperty(_target, prop, descriptor) {
      // Object.defineProperty(moduleEnvironmentRecord, prop, descriptor) would work if someone in the npm
      // community didn't come up with the idea to redefine property in the getter.
      if (has(descriptor, 'value')) {
        // This will result in non-enumerable properties being enumerable, but it's better than undefined
        assignProp(prop, descriptor.value);
      } else {
        // Running the getter defeats some lazy initialization tricks.
        // Whoever depends on getters on exports for lazy init instead
        // of factory functions should face the consequences.
        assignProp(prop, descriptor.get ? descriptor.get() : undefined);
      }
      return true;
    },
  });

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
    // If you read this file carefully, you'll see it's not possible for a cjs module to not have the default anymore.
    // It's currently possible to require modules that were not created by this file though.
    if (has(namespace, 'default')) {
      return namespace.default;
    } else {
      return namespace;
    }
  });

  const afterExecute = () => {
    const exportsHaveBeenOverwritten = finalExports !== originalExports;
    // Promotes keys from redefined module.export to top level namespace for import *
    // Note: We could do it less consistently but closer to how node does it if we iterated over exports detected by
    // the lexer.
    if (exportsHaveBeenOverwritten) {
      moduleEnvironmentRecord.default = finalExports;
      keys(moduleEnvironmentRecord.default || {}).forEach(prop => {
        if (prop !== 'default')
          moduleEnvironmentRecord[prop] = moduleEnvironmentRecord.default[prop];
      });
    }
  };

  return {
    module,
    moduleExports: originalExports,
    afterExecute,
    require,
  };
};
