// @ts-check

/** @typedef {import('./types.js').ReadFn} ReadFn */
/** @typedef {import('./types.js').ReadPowers} ReadPowers */

const { apply } = Reflect;
const { freeze, keys, create, hasOwnProperty, defineProperty } = Object;

/**
 * @param {Object} object
 * @param {string} key
 * @returns {boolean}
 */
const has = (object, key) => apply(hasOwnProperty, object, [key]);

const noTrailingSlash = path => {
  const l = path.length - 1;
  return path[l] === '\\' || path[l] === '/' ? path.slice(0, -1) : path;
};

/**
 * Generates values for __filename and __dirname from location
 *
 * @param {ReadPowers | ReadFn | undefined} readPowers
 * @param {string} location
 * @returns {{
 *   filename:string|null,
 *   dirname: string|null
 * }}
 */
export const getModulePaths = (readPowers, location) => {
  if (
    readPowers &&
    typeof readPowers !== 'function' &&
    readPowers.fileURLToPath
  ) {
    let filename = location;
    let dirname;
    try {
      dirname = new URL('./', filename).href;
    } catch (_) {
      return {
        filename: null,
        dirname: null,
      };
    }

    filename = readPowers.fileURLToPath(filename).toString();
    dirname = noTrailingSlash(readPowers.fileURLToPath(dirname).toString());

    return {
      filename,
      dirname,
    };
  } else {
    return {
      filename: null,
      dirname: null,
    };
  }
};

/**
 * ModuleEnvironmentRecord wrapper
 * Creates shared export processing primitives to be used both Location and Archive usecases of cjs
 *
 * @param {Object} in
 * @param {Object} in.moduleEnvironmentRecord
 * @param {Compartment} in.compartment
 * @param {Record<string, string>} in.resolvedImports
 * @param {string} in.location
 * @param {ReadFn|ReadPowers} in.readPowers
 * @returns {{
 *   module: { exports: any },
 *   moduleExports: any,
 *   afterExecute: Function,
 *   require: Function,
 * }}
 */
export const wrap = ({
  moduleEnvironmentRecord,
  compartment,
  resolvedImports,
  location,
  readPowers,
}) => {
  // This initial default value makes things like exports.hasOwnProperty() work in cjs.
  moduleEnvironmentRecord.default = create(
    compartment.globalThis.Object.prototype,
  );

  // Set all exported properties on the defult and call namedExportProp to add them on the namespace for import *.
  // Root namespace is only accessible for imports. Requiring from cjs gets the default field of the namespace.
  const promoteToNamedExport = (prop, value) => {
    //  __esModule needs to be present for typescript-compiled modules to work, can't be skipped
    if (prop !== 'default') {
      moduleEnvironmentRecord[prop] = value;
    }
  };

  const originalExports = new Proxy(moduleEnvironmentRecord.default, {
    set(_target, prop, value) {
      promoteToNamedExport(prop, value);
      moduleEnvironmentRecord.default[prop] = value;
      return true;
    },
    defineProperty(target, prop, descriptor) {
      if (has(descriptor, 'value')) {
        // This will result in non-enumerable properties being enumerable for named import purposes. We could check
        // enumerable here, but I don't see possible benefits of such restriction.
        promoteToNamedExport(prop, descriptor.value);
      }
      // All the defineProperty trickery with getters used for lazy initialization will work. The trap is here only to
      // elevate the values with namedExportProp whenever possible. Replacing getters with wrapped ones to facilitate
      // propagating the lazy value to the namespace is not possible because defining a property with modified
      // descriptor.get in the trap will cause an error.
      // Object.defineProperty is used instead of Reflect.defineProperty for better error messages.
      defineProperty(target, prop, descriptor);
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

  const require = (/** @type {string} */ importSpecifier) => {
    const namespace = compartment.importNow(resolvedImports[importSpecifier]);
    // If you read this file carefully, you'll see it's not possible for a cjs module to not have the default anymore.
    // It's currently possible to require modules that were not created by this file though.
    if (has(namespace, 'default')) {
      return namespace.default;
    } else {
      return namespace;
    }
  };
  if (typeof readPowers === 'object' && readPowers.requireResolve) {
    const { requireResolve } = readPowers;
    require.resolve = freeze((specifier, options) =>
      requireResolve(location, specifier, options),
    );
  } else {
    require.resolve = freeze(specifier => {
      const error = Error(
        `Cannot find module '${specifier}'\nPass ReadPowers with a requireResolve function to provide require.resolve`,
      );
      defineProperty(error, 'code', { value: 'MODULE_NOT_FOUND' });
      throw error;
    });
  }

  freeze(require);

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
