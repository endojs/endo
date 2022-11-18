// @ts-check

/** @typedef {import('./types.js').Language} Language */

import { join, relativize } from './node-module-specifier.js';

const { entries, fromEntries } = Object;
const { isArray } = Array;

/**
 * @param {string} name - the name of the referrer package.
 * @param {Object} browser - the `browser` field from a package.json
 * @param main
 * @yields {[string, string]}
 */
function* interpretBrowserExports(name, browser, main = 'index.js') {
  if (typeof browser === 'string') {
    yield [name, relativize(browser)];
    return;
  }
  if (Object(browser) !== browser) {
    throw new Error(
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
      yield [join(name, '.'), relativize(value)];
      // eslint-disable-next-line no-continue
      continue;
    }
    // https://github.com/defunctzombie/package-browser-field-spec#replace-specific-files---advanced
    if (key.startsWith('./') || key === '.') {
      // local module replace
      yield [join(name, key), relativize(value)];
    } else {
      // dependency replace
      // yield [key, value];
      // TODO: handle elsewhere?
    }
  }
}

/**
 * @param {string} name - the name of the referrer package.
 * @param {Object} exports - the `exports` field from a package.json.
 * @param {Set<string>} tags - build tags about the target environment
 * for selecting relevant exports, e.g., "browser" or "node".
 * @yields {[string, string]}
 */
function* interpretExports(name, exports, tags) {
  if (isArray(exports)) {
    for (const section of exports) {
      const results = [...interpretExports(name, section, tags)];
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
    throw new Error(
      `Cannot interpret package.json exports property for package ${name}, must be string or object, got ${exports}`,
    );
  }
  for (const [key, value] of entries(exports)) {
    if (key.startsWith('./') || key === '.') {
      yield* interpretExports(join(name, key), value, tags);
    } else if (tags.has(key)) {
      yield* interpretExports(name, value, tags);
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
 * @param {Object} packageDescriptor - the parsed body of a package.json file.
 * @param {string} packageDescriptor.name
 * @param {string} packageDescriptor.main
 * @param {string} [packageDescriptor.module]
 * @param {string} [packageDescriptor.browser]
 * @param {Object} [packageDescriptor.exports]
 * @param {Set<string>} tags - build tags about the target environment
 * for selecting relevant exports, e.g., "browser" or "node".
 * @param {Record<string, Language>} types - an object to populate
 * with any recognized module's type, if implied by a tag.
 * @yields {[string, string]}
 */
export const inferExportsEntries = function* inferExportsEntries(
  { name, main, module, browser, exports },
  tags,
  types,
) {
  // From lowest to highest precedence, such that later entries override former
  // entries.
  if (module !== undefined && tags.has('import')) {
    // In this one case, the key "module" has carried a hint that the
    // referenced module is an ECMASCript module, and that hint may be
    // necessary to override whatever type might be inferred from the module
    // specifier extension.
    const spec = relativize(module);
    types[spec] = 'mjs';
    yield [name, spec];
  } else if (main !== undefined) {
    yield [name, relativize(main)];
  }
  if (browser !== undefined && tags.has('browser')) {
    yield* interpretBrowserExports(name, browser, main);
  }
  if (exports !== undefined) {
    yield* interpretExports(name, exports, tags);
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
 * @param {Object} descriptor - the parsed body of a package.json file.
 * @param {Set<string>} tags - build tags about the target environment
 * for selecting relevant exports, e.g., "browser" or "node".
 * @param {Record<string, Language>} types - an object to populate
 * with any recognized module's type, if implied by a tag.
 * @returns {Record<string, string>}
 */
export const inferExports = (descriptor, tags, types) =>
  fromEntries(inferExportsEntries(descriptor, tags, types));
