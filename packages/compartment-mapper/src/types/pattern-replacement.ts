/**
 * Types for subpath pattern matching.
 *
 * @module
 */

/**
 * Result of a successful pattern match.
 */
export interface SubpathReplacerResult {
  /** The resolved module path */
  result: string;
  /** Optional compartment name for cross-compartment patterns */
  compartment?: string;
}

/**
 * A function that attempts to match a specifier against patterns
 * and returns the replacement path (with optional compartment), or null if no match.
 */
export type SubpathReplacer = (
  specifier: string,
) => SubpathReplacerResult | null;

/**
 * Input format for pattern mappings - either an array of tuples,
 * an array of PatternDescriptors, or a record object.
 */
export type SubpathMapping =
  | Array<[pattern: string, replacement: string]>
  | Record<string, string>;

/**
 * A pattern descriptor for wildcard-based module resolution.
 * The `from` pattern is matched against module specifiers,
 * and `to` is the replacement pattern.
 *
 * Wildcards (`*`) match any substring including `/` (Node.js semantics).
 */
export interface PatternDescriptor {
  /** Source pattern with wildcard, e.g., "./lib/*.js" */
  from: string;
  /** Target pattern with wildcard, e.g., "./*.js" */
  to: string;
  /**
   * Optional compartment name where the resolved module lives.
   * When absent, the pattern resolves within the owning compartment.
   * Set when propagating export patterns from a dependency package.
   */
  compartment?: string;
}
