/**
 * Constants used throughout the package
 *
 * @module
 */

const { freeze } = Object;

/**
 * Language for ES modules
 * @group Constants
 */
export const MJS_LANGUAGE = 'mjs';

/**
 * Language for CommonJS modules
 * @group Constants
 */
export const CJS_LANGUAGE = 'cjs';

/**
 * Language for ESM TypeScript modules.
 *
 * Sources are run through Node.js' `module.stripTypeScriptTypes()` before
 * parsing; the rest of the pipeline treats them as ESM. Only the strip-only
 * subset of TypeScript is supported (no `enum`, no `namespace`, no parameter
 * properties, no `import = require()`).
 *
 * Requires Node.js v22.13.0 or v23.2.0+.
 *
 * @group Constants
 */
export const MTS_LANGUAGE = 'mts';

/**
 * Babel source type for ES modules
 *
 * Corresponds to {@link MJS_LANGUAGE}
 * @group Constants
 */
export const BABEL_SOURCE_TYPE_MODULE = 'module';

/**
 * Babel source type for CommonJS modules
 *
 * Corresponds to {@link CJS_LANGUAGE}
 * @group Constants
 */
export const BABEL_SOURCE_TYPE_COMMONJS = 'commonjs';

/**
 * A no-op
 * @internal
 */
export const noop = freeze(() => {});

/**
 * Identity function
 * @internal
 */
export const identity = freeze(
  /**
   * @template T
   * @param {T} x
   * @returns {T}
   */
  x => x,
);
