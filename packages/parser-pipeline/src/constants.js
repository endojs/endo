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
export const MJS_SOURCE_TYPE = 'mjs';

/**
 * Language for CommonJS modules
 * @group Constants
 */
export const CJS_SOURCE_TYPE = 'cjs';

/**
 * Babel source type for ES modules
 *
 * Corresponds to {@link MJS_SOURCE_TYPE}
 * @group Constants
 */
export const BABEL_SOURCE_TYPE_MODULE = 'module';

/**
 * Babel source type for CommonJS modules
 *
 * Corresponds to {@link CJS_SOURCE_TYPE}
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
