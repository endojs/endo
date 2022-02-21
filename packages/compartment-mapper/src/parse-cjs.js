// @ts-check
import { analyzeCommonJS } from '@endo/cjs-module-analyzer';

const textDecoder = new TextDecoder();

const { freeze } = Object;

/**
 * @param {string} rel - a relative URL
 * @param {string} abs - a fully qualified URL
 * @returns {string}
 */
const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

/**
 * @param {Error} error - error to throw on execute
 * @returns {import('./types.js').StaticModuleType}
 */
export const scheduleError = error => {
  // Return a place-holder that'd throw an error if executed
  // This allows cjs parser to more eagerly find calls to require
  // - if parser identified a require call that's a local function, execute will never be called
  // - if actual required module is missing, the error will happen anyway - at execution time
  // For debugging purposes, when you need to trace the original stack to the postponed error, try this:
  // Error.captureStackTrace(error)
  return freeze({
    imports: [],
    exports: [],
    execute: () => {
      throw error;
    },
  });
};

/**
 * @param {import('./types.js').ReadFn} read
 * @returns {Promise<import('./types.js').StaticModuleType>}
 */
export const readAndParse = async (
  read,
  moduleSpecifier,
  packageLocation,
  transforms,
) => {
  // Collate candidate locations for the moduleSpecifier per Node.js
  // conventions.
  const candidates = [];
  if (moduleSpecifier === '.') {
    candidates.push('./index.js');
  } else {
    candidates.push(moduleSpecifier);
    // if (parseExtension(moduleSpecifier) === '') { // this should not be needed for cjs
    candidates.push(`${moduleSpecifier}.js`, `${moduleSpecifier}/index.js`);
    // }
  }
  let moduleBytes;
  for (const candidateSpecifier of candidates) {
    // Using a specifier as a location.
    // This is not always valid.
    // But, for Node.js, when the specifier is relative and not a directory
    // name, they are usable as URL's.
    const moduleLocation = resolveLocation(candidateSpecifier, packageLocation);
    // eslint-disable-next-line no-await-in-loop
    moduleBytes = await read(moduleLocation).catch(_error => undefined);
    if (moduleBytes !== undefined) {
      break;
    }
  }

  if (!moduleBytes) {
    return scheduleError(
      // TODO offer breadcrumbs in the error message, or how to construct breadcrumbs with another tool.
      new Error(
        `Cannot find file for internal module ${q(
          moduleSpecifier,
        )} (with candidates ${candidates
          .map(x => q(x))
          .join(', ')}) in package ${packageLocation}`,
      ),
    );
  }
  
  if (transforms) {
    ({ bytes, parser: language } = await transforms(
      bytes,
      specifier,
      location,
      packageLocation,
    ));
  }

  return parseCjs(bytes, specifier, location, packageLocation);
};

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

  /**
   * @param {Object} moduleExports
   * @param {Compartment} compartment
   * @param {Record<string, string>} resolvedImports
   */
  const execute = (moduleExports, compartment, resolvedImports) => {
    const functor = compartment.evaluate(
      `(function (require, exports, module, __filename, __dirname) { ${source} //*/\n})\n//# sourceURL=${location}`,
    );
    let exportsReferenceCopy = moduleExports;
    const module = freeze({
      get exports() {
        return exportsReferenceCopy;
      },
      set exports(value) {
        exportsReferenceCopy = value;
      },
    });

    const require = freeze((/** @type {string} */ importSpecifier) => {
      const namespace = compartment.importNow(resolvedImports[importSpecifier]);
      if (namespace.default !== undefined) {
        if (Object.keys(namespace).length > 1) {
          return { ...namespace.default, ...namespace }; // this resembles Node's behavior more closely
        } else {
          return namespace.default;
        }
      }
      return namespace;
    });

    functor(
      require,
      exportsReferenceCopy,
      module,
      location, // __filename
      new URL('./', location).toString(), // __dirname
    );
    if (exportsReferenceCopy !== moduleExports) {
      moduleExports.default = exportsReferenceCopy;
    }
  };

  return {
    parser: 'cjs',
    bytes,
    record: freeze({ imports, exports, reexports, execute }),
  };
};
