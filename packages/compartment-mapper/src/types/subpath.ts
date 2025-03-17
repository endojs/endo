/**
 * Types for the `subpath` module
 *
 * @module
 * @internal
 */

/**
 * Object containing data about pattern replacement
 */
export interface SubpathParts {
  patternParts: string[];
  replacementParts: string[];
}

/**
 * Function which replaces a specifier with the corresponding replacement path if possible
 *
 * @param text The text to be replaced
 * @returns `null` if no replacement found
 */

export type SubpathReplacer = (text: string) => string | null;

/**
 * Pattern string (alias)
 */
export type Pattern = string;

/**
 * Replacement string (alias)
 */
export type Replacement = string;

/**
 * Acceptable input for `makeMultiSubpathReplacer()`
 */
export type SubpathMapping = Record<Pattern, Replacement> | SubpathEntries;

/**
 * Array of tuples of `Pattern, Replacement`
 */
export type SubpathEntries = [pattern: Pattern, replacement: Replacement][];

/**
 * Interface for a `TrieNode` which can be represented as JSON
 *
 * Implemented by `PathTrieNode`
 */
export interface TrieNode {
  value: SubpathParts | null;
  readonly children: Record<string, TrieNode>;
}

/**
 * Interface for a `Trie` which can be represented as JSON
 *
 * Implemented by `PathTrie`
 */
export interface Trie {
  readonly root: TrieNode;
}
