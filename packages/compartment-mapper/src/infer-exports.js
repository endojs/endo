/**
 * Provides functions needed by `node-modules.js` for building
 * inter-compartment linkage according to the specifications in a
 * `package.json` as laid out in the `node_modules` convention.
 * These functions implement the behavior for a package's `"main"`,
 * `"browser"`, `"imports"`, and `"exports"` properties in a `package.json`.
 *
 * @module
 */

/**
 * @import {LanguageForExtension, PackageDescriptor} from './types.js'
 * @import {Node} from './types/node-modules.js'
 */

import { join, relativize } from './node-module-specifier.js';

const { entries, fromEntries, assign } = Object;
const { isArray } = Array;

/**
 * @param {string} name - the name of the referrer package.
 * @param {object} browser - the `browser` field from a package.json
 * @param {string} main - the `main` field from a package.json
 * @yields {[string, string]}
 */
function* interpretBrowserField(name, browser, main = 'index.js') {
  if (typeof browser === 'string') {
    yield ['.', relativize(browser)];
    return;
  }
  if (Object(browser) !== browser) {
    throw Error(
      `Cannot interpret package.json browser property for package ${name}, must be string or object, got ${browser}`,
    );
  }
  for (const [key, value] of entries(browser)) {
    // https://github.com/defunctzombie/package-browser-field-spec#ignore-a-module
    if (value === false) {
      // eslint-disable-next-line no-continue
      continue;
    }
    // replace main export in object form
    // https://github.com/defunctzombie/package-browser-field-spec/issues/16
    if (key === main) {
      yield ['.', relativize(value)];
      // eslint-disable-next-line no-continue
      continue;
    }
    // https://github.com/defunctzombie/package-browser-field-spec#replace-specific-files---advanced
    if (key.startsWith('./') || key === '.') {
      // local module replace
      yield [key, relativize(value)];
    } else {
      // dependency replace
      yield [key, value];
    }
  }
}

/**
 * @param {string} name - the name of the referrer package.
 * @param {object} exports - the `exports` field from a package.json.
 * @param {Set<string>} conditions - build conditions about the target environment
 * for selecting relevant exports, e.g., "browser" or "node".
 * @yields {[string, string]}
 * @returns {Generator<[string, string]>}
 */
function* interpretExports(name, exports, conditions) {
  if (isArray(exports)) {
    for (const section of exports) {
      const results = [...interpretExports(name, section, conditions)];
      if (results.length > 0) {
        yield* results;
        break;
      }
    }
  }
  if (typeof exports === 'string') {
    yield [name, relativize(exports)];
    return;
  }
  if (Object(exports) !== exports) {
    throw Error(
      `Cannot interpret package.json exports property for package ${name}, must be string or object, got ${exports}`,
    );
  }
  for (const [key, value] of entries(exports)) {
    // "./" is explicitly an invalid key, but that doesn't
    // stop people from trying to use it.
    if (key === './') {
      // eslint-disable-next-line no-continue
      continue; // or no-op
    } else if (key.startsWith('./') || key === '.') {
      if (name === '.') {
        yield* interpretExports(key, value, conditions);
      } else {
        yield* interpretExports(join(name, key), value, conditions);
      }
    } else if (conditions.has(key)) {
      yield* interpretExports(name, value, conditions);
      // Take only the first matching tag.
      break;
    }
  }
}

/**
 * Given an unpacked `package.json`, generate a series of `[name, target]`
 * pairs to represent what this package exports. `name` is what the
 * caller/importer asked for (for example, the `ses` in `import { stuff } from
 * 'ses'`, or the `ses/deeper` in `import { stuff } from 'ses/deeper'`).
 * `target` is the path relative to the imported package's root: frequently
 * `./index.js` or `./src/index.js` or (for a deep import) `./src/deeper.js`.
 * There may be multiple pairs for a single `name`, but they will be yielded in
 * ascending priority order, and the caller should use the last one that exists.
 *
 * @param {PackageDescriptor} packageDescriptor - the parsed body of a package.json file.
 * @param {Set<string>} conditions - build conditions about the target environment
 * for selecting relevant exports, e.g., "browser" or "node".
 * @param {LanguageForExtension} types - an object to populate
 * with any recognized module's type, if implied by a tag.
 * @yields {[string, string]}
 */
export const inferExportsEntries = function* inferExportsEntries(
  { main, module, exports },
  conditions,
  types,
) {
  // From lowest to highest precedence, such that later entries override former
  // entries.
  if (module !== undefined && conditions.has('import')) {
    // In this one case, the key "module" has carried a hint that the
    // referenced module is an ECMASCript module, and that hint may be
    // necessary to override whatever type might be inferred from the module
    // specifier extension.
    const spec = relativize(module);
    types[spec] = 'mjs';
    yield ['.', spec];
  } else if (main !== undefined) {
    yield ['.', relativize(main)];
  }
  if (exports !== undefined) {
    yield* interpretExports('.', exports, conditions);
  }
  // TODO Otherwise, glob 'files' for all '.js', '.cjs', and '.mjs' entry
  // modules, taking care to exclude node_modules.
};

/**
 * inferExports reads a package.json (package descriptor) and constructs a map
 * of all the modules that package exports.
 * The keys are the module specifiers for the module map of any package that
 * depends upon this one, like `semver` for the main module of the `semver`
 * package.
 * The values are the corresponding module specifiers in the dependency
 * package's module map, like `./index.js`.
 *
 * @param {PackageDescriptor} descriptor - the parsed body of a package.json file.
 * @param {Set<string>} conditions - build conditions about the target environment
 * for selecting relevant exports, e.g., "browser" or "node".
 * @param {LanguageForExtension} types - an object to populate
 * with any recognized module's type, if implied by a tag.
 * @returns {Record<string, string>}
 */
export const inferExports = (descriptor, conditions, types) =>
  fromEntries(inferExportsEntries(descriptor, conditions, types));

/**
 *
 * @param {PackageDescriptor} descriptor
 * @param {Node['externalAliases']} externalAliases
 * @param {Node['internalAliases']} internalAliases
 * @param {Set<string>} conditions
 * @param {Record<string, string>} types
 */
export const inferExportsAndAliases = (
  descriptor,
  externalAliases,
  internalAliases,
  conditions,
  types,
) => {
  const { name, type, main, module, exports, browser } = descriptor;

  // collect externalAliases from exports and main/module
  assign(
    externalAliases,
    fromEntries(inferExportsEntries(descriptor, conditions, types)),
  );

  // expose default module as package root
  // may be overwritten by browser field
  // see https://github.com/endojs/endo/issues/1363
  if (module === undefined && exports === undefined) {
    const defaultModule = main !== undefined ? relativize(main) : './index.js';
    externalAliases['.'] = defaultModule;
    // in commonjs, expose package root as default module
    if (type !== 'module') {
      internalAliases['.'] = defaultModule;
    }
  }

  // if present, allow "browser" field to populate moduleMap
  if (conditions.has('browser') && browser !== undefined) {
    for (const [specifier, target] of interpretBrowserField(
      name,
      browser,
      main,
    )) {
      const specifierIsRelative =
        specifier.startsWith('./') || specifier === '.';
      // only relative entries in browser field affect external aliases
      if (specifierIsRelative) {
        externalAliases[specifier] = target;
      }
      internalAliases[specifier] = target;
    }
  }
};
