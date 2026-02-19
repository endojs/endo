/**
 * Provides prefix-tree-based pattern matching for Node.js-style subpath exports.
 * Patterns use `*` as a wildcard that matches any string within a single
 * path segment (does not match across `/`).
 *
 * @module
 */

/**
 * @import {
 *   SubpathParts,
 *   PrefixTreeNode,
 *   PrefixTree,
 *   SubpathReplacer,
 *   SubpathMapping,
 *   PatternDescriptor,
 * } from './types/pattern-replacement.js'
 */

const { hasOwn, create, entries } = Object;
const { isArray } = Array;

/**
 * Path wildcard character - matches any string within a segment
 */
const WILDCARD = '*';

/**
 * Path separator; Win32-style paths unsupported
 */
const PATH_SEP = '/';

/**
 * Greedy magic globstar; unsupported
 */
const GLOBSTAR = '**';

/**
 * Checks if a segment contains a wildcard.
 *
 * @param {string} segment
 * @returns {boolean}
 */
const hasWildcard = segment => segment.includes(WILDCARD);

/**
 * Attempts to match a specifier segment against a pattern segment.
 * Returns the captured wildcard value if matched, or null if no match.
 *
 * @param {string} patternSegment - Pattern segment (may contain '*')
 * @param {string} specifierSegment - Actual segment to match
 * @returns {string | null} The captured wildcard value, or null if no match
 */
const matchSegment = (patternSegment, specifierSegment) => {
  if (!hasWildcard(patternSegment)) {
    // Exact match required
    return patternSegment === specifierSegment ? '' : null;
  }

  const wildcardIndex = patternSegment.indexOf(WILDCARD);
  const prefix = patternSegment.slice(0, wildcardIndex);
  const suffix = patternSegment.slice(wildcardIndex + 1);

  // Check prefix and suffix match
  if (!specifierSegment.startsWith(prefix)) {
    return null;
  }
  if (!specifierSegment.endsWith(suffix)) {
    return null;
  }

  // Ensure the captured part doesn't overlap
  const capturedLength =
    specifierSegment.length - prefix.length - suffix.length;
  if (capturedLength < 0) {
    return null;
  }

  return specifierSegment.slice(prefix.length, specifierSegment.length - suffix.length);
};

/**
 * Substitutes a captured value into a replacement segment.
 *
 * @param {string} replacementSegment - Replacement segment (may contain '*')
 * @param {string} captured - The captured wildcard value
 * @returns {string} The substituted segment
 */
const substituteSegment = (replacementSegment, captured) => {
  if (!hasWildcard(replacementSegment)) {
    return replacementSegment;
  }
  return replacementSegment.replace(WILDCARD, captured);
};

/**
 * Node in the pattern prefix tree. Each node represents a path segment.
 *
 * @implements {PrefixTreeNode}
 */
export class PathPrefixTreeNode {
  /**
   * The value stored at this node, if this node represents
   * the end of a complete pattern.
   *
   * @type {SubpathParts | null}
   */
  value = null;

  /**
   * Mapping of path segments to child nodes.
   * Segments containing wildcards are stored as-is (e.g., "*.js").
   *
   * @type {Record<string, PathPrefixTreeNode>}
   */
  children = create(null);

  /**
   * Sets the pattern/replacement value at this node.
   *
   * @param {string[]} patternParts
   * @param {string[]} replacementParts
   */
  setValue(patternParts, replacementParts) {
    this.value = { patternParts, replacementParts };
  }

  /**
   * Gets or creates a child node for the given path segment.
   *
   * @param {string} part - Path segment (may contain '*')
   * @returns {PathPrefixTreeNode} The child node
   */
  appendChild(part) {
    if (!hasOwn(this.children, part)) {
      this.children[part] = new PathPrefixTreeNode();
    }
    return this.children[part];
  }
}

/**
 * Prefix tree data structure for efficient pattern matching.
 * Patterns are split by '/' and stored as a tree where each node
 * represents a path segment. Segments with wildcards are matched
 * using prefix/suffix matching.
 *
 * @implements {PrefixTree}
 */
export class PathPrefixTree {
  /**
   * Root node of the prefix tree.
   *
   * @type {PathPrefixTreeNode}
   */
  root = new PathPrefixTreeNode();

  /**
   * Insert a pattern/replacement pair into the prefix tree.
   *
   * @param {string} pattern - Source pattern, e.g., "./lib/*.js"
   * @param {string} replacement - Target pattern, e.g., "./src/*.mjs"
   */
  insert(pattern, replacement) {
    let node = this.root;
    const patternParts = pattern.split(PATH_SEP);
    const replacementParts = replacement.split(PATH_SEP);

    for (const part of patternParts) {
      node = node.appendChild(part);
    }
    node.setValue(patternParts, replacementParts);
  }

  /**
   * Search for a matching pattern. Returns match result with captured
   * wildcard values if found.
   *
   * @param {string} specifier - Module specifier to match
   * @returns {{ patternParts: string[], replacementParts: string[], captures: string[] } | null}
   */
  search(specifier) {
    /** @type {string[]} */
    const captures = [];
    const result = this.#search(
      this.root,
      specifier.split(PATH_SEP),
      0,
      captures,
    );
    if (result) {
      return { ...result, captures };
    }
    return null;
  }

  /**
   * Recursive search implementation with capture tracking.
   *
   * @param {PathPrefixTreeNode} node - Current node
   * @param {string[]} parts - Specifier split into segments
   * @param {number} offset - Current position in parts array
   * @param {string[]} captures - Array to collect captured wildcard values
   * @returns {SubpathParts | null}
   */
  #search(node, parts, offset, captures) {
    // If we've consumed all parts, check if this node has a value
    if (offset === parts.length) {
      return node.value;
    }

    const part = parts[offset];

    // Try exact match first (more specific patterns take precedence)
    if (hasOwn(node.children, part)) {
      const result = this.#search(
        node.children[part],
        parts,
        offset + 1,
        captures,
      );
      if (result) {
        return result;
      }
    }

    // Try wildcard segment matches
    for (const [childKey, childNode] of entries(node.children)) {
      if (hasWildcard(childKey)) {
        const captured = matchSegment(childKey, part);
        if (captured !== null) {
          const captureIndex = captures.length;
          captures.push(captured);
          const result = this.#search(childNode, parts, offset + 1, captures);
          if (result) {
            return result;
          }
          // Backtrack: remove the capture if this path didn't work
          captures.length = captureIndex;
        }
      }
    }

    return null;
  }
}

/**
 * Validates that the pattern and replacement have the same number of wildcards.
 * This is required because each wildcard in the pattern corresponds to a
 * captured value that must be substituted in the replacement.
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
 * Creates a multi-pattern replacer using a prefix tree for efficient lookup.
 * Patterns are matched in order of specificity (exact matches before wildcards).
 *
 * @param {SubpathMapping} mapping - Pattern to replacement mapping
 * @returns {SubpathReplacer} Function that matches a specifier and returns the replacement
 */
export const makeMultiSubpathReplacer = mapping => {
  const prefixTree = new PathPrefixTree();

  const mappingEntries = isArray(mapping) ? mapping : entries(mapping);
  for (const [pattern, replacement] of mappingEntries) {
    if (pattern.includes(GLOBSTAR)) {
      throw new TypeError(
        `Globstar (**) patterns are not supported in pattern: "${pattern}"`,
      );
    }
    if (replacement.includes(GLOBSTAR)) {
      throw new TypeError(
        `Globstar (**) patterns are not supported in replacement: "${replacement}"`,
      );
    }
    assertMatchingWildcardCount(pattern, replacement);
    prefixTree.insert(pattern, replacement);
  }

  return specifier => {
    const result = prefixTree.search(specifier);
    if (!result) {
      return null;
    }

    const { replacementParts, captures } = result;

    // Substitute captured values into replacement segments
    let captureIndex = 0;
    const outputParts = replacementParts.map(segment => {
      if (hasWildcard(segment)) {
        const output = substituteSegment(segment, captures[captureIndex]);
        captureIndex += 1;
        return output;
      }
      return segment;
    });

    return outputParts.join(PATH_SEP);
  };
};
