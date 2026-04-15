/**
 * Provides pattern matching for Node.js-style subpath exports and imports.
 * Patterns use `*` as a wildcard that matches any string, including across
 * `/` path separators, matching Node.js semantics.
 *
 * @module
 */

/**
 * @import {
 *   SubpathReplacer,
 *   SubpathReplacerResult,
 *   SubpathMapping,
 *   PatternDescriptor,
 *   ResolvedPattern,
 * } from './types/pattern-replacement.js'
 */

const { entries } = Object;
const { isArray } = Array;

/**
 * Validates that the pattern and replacement have the same number of wildcards.
 * Node.js restricts subpath patterns to exactly one `*` on each side.
 *
 * @param {string} pattern - Source pattern
 * @param {string} replacement - Target pattern
 * @throws {Error} If wildcard counts don't match
 */
export const assertMatchingWildcardCount = (pattern, replacement) => {
  const patternCount = (pattern.match(/\*/g) || []).length;
  const replacementCount = (replacement.match(/\*/g) || []).length;
  if (patternCount !== replacementCount) {
    throw new Error(
      `Wildcard count mismatch: "${pattern}" has ${patternCount}, "${replacement}" has ${replacementCount}`,
    );
  }
};

/**
 * Compare two pattern keys using Node.js's PATTERN_KEY_COMPARE ordering.
 * This prefers the longest prefix before `*`, then the longest full key.
 * For example, `./foo/*.js` outranks `./foo/*`.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
const patternKeyCompare = (a, b) => {
  const aBaseLength = a.indexOf('*') + 1;
  const bBaseLength = b.indexOf('*') + 1;
  if (aBaseLength > bBaseLength) {
    return -1;
  }
  if (bBaseLength > aBaseLength) {
    return 1;
  }
  if (a.length > b.length) {
    return -1;
  }
  if (b.length > a.length) {
    return 1;
  }
  return 0;
};

/**
 * Classifies a pattern/replacement pair as exact or wildcard and adds it
 * to the appropriate collection.
 *
 * @param {string} pattern
 * @param {string | null} replacement
 * @param {string | undefined} compartment
 * @param {Map<string, { replacement: string | null, compartment?: string }>} exactEntries
 * @param {ResolvedPattern[]} wildcardEntries
 */
const classifyPatternEntry = (
  pattern,
  replacement,
  compartment,
  exactEntries,
  wildcardEntries,
) => {
  if (replacement !== null) {
    assertMatchingWildcardCount(pattern, replacement);
  }

  const wildcardIndex = pattern.indexOf('*');
  if (wildcardIndex === -1) {
    exactEntries.set(pattern, { replacement, compartment });
    return;
  }

  const prefix = pattern.slice(0, wildcardIndex);
  const suffix = pattern.slice(wildcardIndex + 1);
  let replacementPrefix = null;
  let replacementSuffix = null;
  if (replacement !== null) {
    const replacementWildcardIndex = replacement.indexOf('*');
    replacementPrefix = replacement.slice(0, replacementWildcardIndex);
    replacementSuffix = replacement.slice(replacementWildcardIndex + 1);
  }
  wildcardEntries.push({
    pattern,
    prefix,
    suffix,
    replacementPrefix,
    replacementSuffix,
    compartment,
  });
};

/**
 * Creates a multi-pattern replacer for Node.js-style subpath patterns.
 *
 * Patterns are matched by specificity: the pattern with the longest matching
 * prefix before the `*` wins. Exact entries (no `*`) take precedence over
 * all wildcard patterns.
 *
 * The `*` wildcard matches any substring, including substrings that contain
 * `/`, matching Node.js semantics.
 *
 * @param {PatternDescriptor[] | SubpathMapping} mapping - Pattern to replacement mapping
 * @returns {SubpathReplacer} Function that matches a specifier and returns the replacement
 */
export const makeMultiSubpathReplacer = mapping => {
  /** @type {Map<string, { replacement: string | null, compartment?: string }>} */
  const exactEntries = new Map();
  /** @type {ResolvedPattern[]} */
  const wildcardEntries = [];

  /** @type {Array<[string, string | null, string | undefined]>} */
  let normalizedEntries;
  if (isArray(mapping)) {
    normalizedEntries = /** @type {typeof normalizedEntries} */ (
      mapping.map(entry => {
        if (isArray(entry)) {
          // [pattern, replacement] tuple
          return [entry[0], entry[1], undefined];
        }
        // PatternDescriptor { from, to, compartment? }
        return [entry.from, entry.to, entry.compartment];
      })
    );
  } else {
    normalizedEntries = /** @type {typeof normalizedEntries} */ (
      entries(mapping).map(([pattern, replacement]) => [
        pattern,
        replacement,
        undefined,
      ])
    );
  }

  for (const [pattern, replacement, compartment] of normalizedEntries) {
    classifyPatternEntry(
      pattern,
      replacement,
      compartment,
      exactEntries,
      wildcardEntries,
    );
  }

  // Match Node.js PATTERN_KEY_COMPARE semantics for subpath pattern
  // precedence: longest prefix before `*`, then longest full pattern key.
  wildcardEntries.sort((a, b) => patternKeyCompare(a.pattern, b.pattern));

  return specifier => {
    // Exact entries take precedence
    const exact = exactEntries.get(specifier);
    if (exact) {
      return { result: exact.replacement, compartment: exact.compartment };
    }

    // Try wildcard patterns in specificity order
    for (const entry of wildcardEntries) {
      if (
        specifier.startsWith(entry.prefix) &&
        specifier.endsWith(entry.suffix) &&
        specifier.length >= entry.prefix.length + entry.suffix.length
      ) {
        // Null replacement means this path is explicitly excluded.
        if (entry.replacementPrefix === null) {
          return { result: null, compartment: entry.compartment };
        }
        const captured = specifier.slice(
          entry.prefix.length,
          specifier.length - entry.suffix.length,
        );
        const result = `${entry.replacementPrefix}${captured}${entry.replacementSuffix}`;
        return { result, compartment: entry.compartment };
      }
    }

    return null;
  };
};
