/**
 * Provides {@link makeLocationUnmapper}
 *
 * @module
 */

import { SourceMapConsumer } from 'source-map-js';

/**
 * A function which modifies an AST Node's source location
 *
 * @callback LocationUnmapper
 * @param {import('@babel/types').SourceLocation|null} [loc]
 * @returns {void}
 * @internal
 */

/**
 * Creates a {@link LocationUnmapper} function
 *
 * @internal
 * @param {string} sourceMap - Source map
 * @param {import('@babel/types').File} ast - AST as created by Babel
 * @returns {LocationUnmapper}
 */
export function makeLocationUnmapper(sourceMap, ast) {
  if (!sourceMap) {
    throw TypeError('Invalid arguments; expected sourceMap');
  }
  if (!ast || typeof ast !== 'object') {
    throw TypeError('Invalid arguments; expected AST ast');
  }
  if (!ast.loc) {
    throw TypeError('No SourceLocation found in AST');
  }
  try {
    // We rearrange the rolled-up chunk according to its sourcemap to move
    // its source lines back to the right place.
    const consumer = new SourceMapConsumer(JSON.parse(sourceMap));
    const unmapped = new WeakSet();
    /**
     * Change this type to `import('@babel/types').Position` if we assign the
     * `index` prop below
     * @type {any}
     */
    let lastPos = {
      ...ast.loc.start,
    };
    return loc => {
      if (!loc || unmapped.has(loc)) {
        return;
      }
      // Make sure things start at least at the right place.
      loc.end = { ...loc.start };
      for (const pos of /** @type {const} */ (['start', 'end'])) {
        if (loc[pos]) {
          const newPos = consumer.originalPositionFor(loc[pos]);
          if (newPos.source !== null) {
            // This assumes that if source is non-null, then line and column are
            // also non-null
            lastPos = {
              line: /** @type {number} */ (newPos.line),
              column: /** @type {number} */ (newPos.column),
              // XXX: what of the `index` prop?
            };
          }
          loc[pos] = lastPos;
        }
      }
      unmapped.add(loc);
    };
  } catch (err) {
    // A source map string should be valid JSON, and if `JSON.parse()` fails, a
    // SyntaxError is thrown
    if (err instanceof SyntaxError) {
      throw TypeError(`Invalid source map: ${err}`);
    }
    throw err;
  }
}
