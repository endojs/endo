/**
 * Types for prefix-tree-based subpath pattern matching.
 *
 * @module
 */

/**
 * The parts of a matched pattern, used to reconstruct the replacement path.
 */
export interface SubpathParts {
  /** The pattern split by '/' */
  patternParts: string[];
  /** The replacement split by '/' */
  replacementParts: string[];
}

/**
 * A node in the pattern prefix tree.
 */
export interface PrefixTreeNode {
  /** Value stored at this node, if it represents a complete pattern */
  value: SubpathParts | null;
  /** Child nodes indexed by path segment */
  children: Record<string, PrefixTreeNode>;
}

/**
 * The root structure of a pattern prefix tree.
 */
export interface PrefixTree {
  root: PrefixTreeNode;
}

/**
 * A function that attempts to match a specifier against patterns
 * and returns the replacement path, or null if no match.
 */
export type SubpathReplacer = (specifier: string) => string | null;

/**
 * Input format for pattern mappings - either an array of tuples
 * or a record object.
 */
export type SubpathMapping =
  | Array<[pattern: string, replacement: string]>
  | Record<string, string>;

/**
 * A pattern descriptor for wildcard-based module resolution.
 * The `from` pattern is matched against module specifiers,
 * and `to` is the replacement pattern.
 *
 * Wildcards (`*`) match exactly one path segment (Node.js semantics).
 */
export interface PatternDescriptor {
  /** Source pattern with wildcards, e.g., "./lib/*.js" */
  from: string;
  /** Target pattern with wildcards, e.g., "./*.js" */
  to: string;
}
