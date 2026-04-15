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
 * @import {LogFn} from './types/external.js'
 * @import {Exports, Imports, Node} from './types/node-modules.js'
 * @import {PatternDescriptor} from './types/pattern-replacement.js'
 */

import { relativize } from './node-module-specifier.js';

const { entries, fromEntries } = Object;
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
 * @param {Exports} exports - the `exports` field from a package.json.
 * @param {Set<string>} conditions - build conditions about the target environment
 * for selecting relevant exports, e.g., "browser" or "node".
 * @param {LanguageForExtension} types - an object to populate
 * with any recognized module's type, if implied by a tag.
 * @yields {[string, string | null]}
 * @returns {Generator<[string, string | null]>}
 */
function* interpretExports(name, exports, conditions, types) {
  // Null targets are exclusions (Node.js semantics).
  if (exports === null) {
    yield [name, null];
    return;
  }
  if (isArray(exports)) {
    for (const section of exports) {
      const results = [...interpretExports(name, section, conditions, types)];
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
      yield* interpretExports(key, value, conditions, types);
    } else if (conditions.has(key)) {
      if (types && key === 'import' && typeof value === 'string') {
        // In this one case, the key "import" has carried a hint that the
        // referenced module is an ECMASCript module, and that hint may be
        // necessary to override whatever type might be inferred from the module
        // specifier extension.
        const spec = relativize(value);
        types[spec] = 'mjs';
      }
      yield* interpretExports(name, value, conditions, types);
      // Take only the first matching tag.
      break;
    }
  }
}

/**
 * Interprets the `imports` field from a package.json file.
 * The imports field provides self-referencing subpath patterns that
 * can be used to create private internal mappings.
 *
 * @param {Imports} imports - the `imports` field from a package.json.
 * @param {Set<string>} conditions - build conditions about the target environment
 * @param {LogFn} log
 * @yields {[string, string | null]}
 * @returns {Generator<[string, string | null]>}
 */
function* interpretImports(imports, conditions, log) {
  if (Object(imports) !== imports || Array.isArray(imports)) {
    throw Error(
      `Cannot interpret package.json imports property, must be object, got ${imports}`,
    );
  }
  for (const [key, value] of entries(imports)) {
    // imports keys must start with '#'
    if (!key.startsWith('#')) {
      log(`Ignoring invalid imports key "${key}": must start with "#"`);
      // eslint-disable-next-line no-continue
      continue;
    }
    if (value === null) {
      // Null targets are exclusions (Node.js semantics).
      yield [key, null];
    } else if (typeof value === 'string') {
      yield [key, relativize(value)];
    } else if (Object(value) === value && !isArray(value)) {
      // Handle conditional imports
      for (const [condition, target] of entries(value)) {
        if (conditions.has(condition)) {
          if (target === null) {
            yield [key, null];
          } else if (typeof target === 'string') {
            yield [key, relativize(target)];
          }
          // Take only the first matching condition
          break;
        }
      }
    } else {
      log(`Ignoring unsupported imports value for "${key}": ${typeof value}`);
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
 * @yields {[string, string | null]}
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
    yield* interpretExports('.', exports, conditions, types);
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
 * Determines if a key or value contains a wildcard pattern.
 *
 * @param {string} key
 * @param {string | null} value
 * @returns {boolean}
 */
const hasWildcard = (key, value) =>
  key.includes('*') || (value?.includes('*') ?? false);

/**
 * Returns the number of `*` characters in a string.
 *
 * @param {string} str
 * @returns {number}
 */
const countWildcards = str => (str.match(/\*/g) || []).length;

/**
 * Validates a wildcard pattern entry and logs warnings for invalid patterns.
 * Returns true if the pattern is valid and should be used.
 *
 * @param {string} key
 * @param {string} value
 * @param {LogFn} log
 * @returns {boolean}
 */
const validateWildcardPattern = (key, value, log) => {
  const keyCount = countWildcards(key);
  const valueCount = countWildcards(value);
  if (keyCount > 1 || valueCount > 1) {
    log(`Ignoring pattern with multiple wildcards "${key}": "${value}"`);
    return false;
  }
  if (keyCount !== valueCount) {
    log(
      `Ignoring pattern with mismatched wildcard count "${key}" (${keyCount}) vs "${value}" (${valueCount})`,
    );
    return false;
  }
  return true;
};

/**
 * Infers exports, internal aliases, and wildcard patterns from a package descriptor.
 * Extracts wildcard patterns from the `exports` and `imports` fields.
 *
 * @param {PackageDescriptor} descriptor
 * @param {Node['externalAliases']} externalAliases
 * @param {Node['internalAliases']} internalAliases
 * @param {PatternDescriptor[]} patterns - array to populate with wildcard patterns
 * @param {Set<string>} conditions
 * @param {Record<string, string>} types
 * @param {LogFn} log
 */
export const inferExportsAliasesAndPatterns = (
  descriptor,
  externalAliases,
  internalAliases,
  patterns,
  conditions,
  types,
  log,
) => {
  const { name, type, main, module, exports, imports, browser } = descriptor;

  // Process exports field - separate wildcards from concrete exports.
  for (const [key, value] of inferExportsEntries(
    descriptor,
    conditions,
    types,
  )) {
    if (value === null) {
      // Null targets are exclusions.
      // Only wildcard null targets need to be stored as patterns;
      // concrete null targets are excluded by omission from aliases.
      if (key.includes('*')) {
        patterns.push({ from: key, to: null });
      }
      // eslint-disable-next-line no-continue
      continue;
    }
    if (hasWildcard(key, value)) {
      if (validateWildcardPattern(key, value, log)) {
        patterns.push({ from: key, to: value });
      }
    } else {
      externalAliases[key] = value;
    }
  }

  // Process imports field (package self-referencing).
  if (imports !== undefined) {
    for (const [key, value] of interpretImports(
      imports,
      conditions,
      log,
    )) {
      if (value === null) {
        if (key.includes('*')) {
          patterns.push({ from: key, to: null });
        }
        // eslint-disable-next-line no-continue
        continue;
      }
      if (hasWildcard(key, value)) {
        if (validateWildcardPattern(key, value, log)) {
          patterns.push({ from: key, to: value });
        }
      } else {
        internalAliases[key] = value;
      }
    }
  }

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
