/**
 * Types for subpath pattern matching.
 *
 * @module
 */

/**
 * Result of a successful pattern match.
 */
export interface SubpathReplacerResult {
  /** The resolved module path, or null for null-target exclusions */
  result: string | null;
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
 * Internal representation of a parsed pattern entry, split into
 * prefix/suffix for efficient matching.
 */
export interface ResolvedPattern {
  /** The original pattern key */
  pattern: string;
  /** The part of the pattern before `*` */
  prefix: string;
  /** The part of the pattern after `*` */
  suffix: string;
  /** The part of the replacement before `*`, or null for exclusions */
  replacementPrefix: string | null;
  /** The part of the replacement after `*`, or null for exclusions */
  replacementSuffix: string | null;
  /** Optional compartment for cross-compartment patterns */
  compartment?: string;
}

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
  /** Target pattern with wildcard, e.g., "./*.js". Null means exclusion. */
  to: string | null;
  /**
   * Optional compartment name where the resolved module lives.
   * When absent, the pattern resolves within the owning compartment.
   * Set when propagating export patterns from a dependency package.
   */
  compartment?: string;
}
