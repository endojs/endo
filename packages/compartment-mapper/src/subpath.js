import { escapeRegExp } from '@endo/regexp-escape';

const { isArray } = Array;
const { hasOwn, create, entries } = Object;

/**
 * @import {
 *   SubpathReplacer,
 *   SubpathMapping,
 *   SubpathParts,
 *   Trie,
 *   TrieNode,
 *   SubpathEntries,
 *   Pattern,
 *   Replacement
 * } from './types/subpath.js'
 */

/**
 * Path wildcard character
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
 * @param {string} pattern a subpath pattern of asterisk-delimited literals
 * @param {string} replacement pattern of respective replacements delimited by asterisks
 * @return {((path: string) => string|null)}
 */
export const makeSubpathReplacer = (pattern, replacement) => {
  const patternParts = pattern.split(WILDCARD);
  const replacementParts = replacement.split(WILDCARD);

  const re = new RegExp(`^${patternParts.map(escapeRegExp).join('(.*)')}$`);
  /**
   * @param {string} path
   */
  return path => {
    if (patternParts.length !== replacementParts.length) {
      return null;
    }
    const match = re.exec(path);
    if (match === null) {
      return null;
    }
    let reconstruction = '';
    let i;
    for (i = 0; i < replacementParts.length - 1; i++) {
      reconstruction += replacementParts[i] + match[i + 1];
    }
    reconstruction += replacementParts[i];
    return reconstruction;
  };
};

/**
 * @internal
 * @implements {TrieNode}
 */
export class PathTrieNode {
  /**
   * @type {SubpathParts | null}
   */
  value;

  /**
   * Mapping of path parts ("prefixes") to child {@link PathTrieNode}s
   *
   * @type {Record<string, PathTrieNode>}
   * @readonly
   */
  children;

  /**
   * @param {SubpathParts|null} [value]
   */
  constructor(value) {
    this.children = create(null);
    this.value = value ?? null;
  }

  /**
   * Sets the internal value
   * @overload
   * @param {string[]} patternParts String parts of pattern
   * @param {string[]} replacementParts String parts of replacement
   * @returns {void}
   */

  /**
   * Sets the internal value to "no value"
   * @overload
   * @param {null} [value] No value
   * @returns {void}
   */

  /**
   * Sets the internal value
   * @param {string[]|null} [patternParts]
   * @param {string[]} [replacementParts]
   * @returns {void}
   */
  setValue(patternParts, replacementParts) {
    this.value =
      patternParts && replacementParts
        ? { patternParts, replacementParts }
        : null;
  }

  /**
   * Appends child `node` to the current {@link PathTrieNode} under the key `part`.
   *
   * @param {string} part Path part (the "prefix")
   * @param {PathTrieNode} [node] A new child node (if not provided, a new one will be created)
   * @returns {PathTrieNode} `node` or the newly-created child `PathTrieNode`
   */
  appendChild(part, node) {
    if (!hasOwn(this.children, part)) {
      this.children[part] = node ?? new PathTrieNode();
    }
    return this.children[part];
  }
}

/**
 * Container for a root node in a Trie
 *
 * @internal
 * @implements {Trie}
 */
export class PathTrie {
  /**
   * Root node; should not be replaced
   *
   * @type {PathTrieNode}
   * @readonly
   */
  root;

  /**
   * Assigns the {@link PathTrie.root root node}.
   *
   * @param {PathTrieNode} [root] If not provided, an empty `PathTrieNode` will be created as the root node
   */

  constructor(root) {
    this.root = root ?? new PathTrieNode();
  }

  /**
   * Given a JSON string `trie`, create a {@link PathTrie} from it
   *
   * @param {string} trieString
   * @returns {PathTrie}
   */
  static fromJSON(trieString) {
    return JSON.parse(trieString, revivePathTrie);
  }

  /**
   * Given a `Trie` object, create a {@link PathTrie} from it
   *
   * @param {Trie} trie
   * @returns {PathTrie}
   */
  static fromTrie(trie) {
    // TODO: This is not efficient; it should re-create a `PathTrie` by walking the `Trie` object recursively (if we care)
    return PathTrie.fromJSON(JSON.stringify(trie));
  }

  /**
   *
   * @param {Pattern} pattern
   * @param {Replacement} replacement
   * @returns {void}
   */
  insert(pattern, replacement) {
    let node = this.root;
    const patternParts = pattern.split(PATH_SEP);
    const replacementParts = replacement.split(PATH_SEP);

    for (const part of patternParts) {
      node = node.appendChild(part, new PathTrieNode());
    }
    node.setValue(patternParts, replacementParts);
  }

  /**
   * Recursive search implementation
   *
   * @param {PathTrieNode} startNode `PathTrieNode` to start searching from
   * @param {string[]} searchPatternPart Array of string parts of a search pattern
   * @param {number} searchPatternOffset Current offset in the `searchPatternPart` array
   * @returns {SubpathParts|null} Resulting replacement and original pattern
   */
  #search(startNode, searchPatternPart, searchPatternOffset = 0) {
    if (searchPatternOffset === searchPatternPart.length) {
      return startNode.value;
    }

    const part = searchPatternPart[searchPatternOffset];

    if (hasOwn(startNode.children, part)) {
      const result = this.#search(
        startNode.children[part],
        searchPatternPart,
        searchPatternOffset + 1,
      );
      if (result) {
        return result;
      }
    }

    if (hasOwn(startNode.children, WILDCARD)) {
      return this.#search(
        startNode.children[WILDCARD],
        searchPatternPart,
        searchPatternOffset + 1,
      );
    }

    return null;
  }

  /**
   * Searches for a pattern in the `Trie` from the root node.
   *
   * Returns `null` if pattern not matched
   *
   * @param {string} searchPattern Pattern to match
   * @returns {SubpathParts|null}
   */
  search(searchPattern) {
    return this.#search(this.root, searchPattern.split(PATH_SEP));
  }
}

/**
 * Factory for a {@link SubpathReplacer}
 *
 * @param {SubpathMapping} mapping a record where the key is the pattern and the value is the replacement
 * @return {SubpathReplacer}
 */
export const makeMultiSubpathReplacer = mapping => {
  const trie = new PathTrie();

  const mappingEntries = /** @type {SubpathEntries} */ (
    isArray(mapping) ? mapping : entries(mapping)
  );
  for (const [pattern, replacement] of mappingEntries) {
    if (pattern.includes(GLOBSTAR)) {
      throw new TypeError(
        `Invalid pattern: ${pattern}; "globstar" matching unsupported`,
      );
    }

    if (replacement.includes(GLOBSTAR)) {
      throw new TypeError(
        `Invalid replacement: ${replacement}; "globstar" matching unsupported`,
      );
    }

    trie.insert(pattern, replacement);
  }

  /**
   * @type {SubpathReplacer}
   */
  const subpathReplacer = text => {
    const result = trie.search(text);
    if (!result) {
      return null;
    }

    const { replacementParts } = result;
    const textParts = text.split(PATH_SEP);
    return replacementParts
      .reduce(
        (acc, part, i) => [...acc, part === WILDCARD ? textParts[i] : part],
        /** @type {string[]} */ ([]),
      )
      .join(PATH_SEP);
  };
  return subpathReplacer;
};

/**
 * Reviver function intended for use with {@link JSON.parse} and a {@link Trie}
 * or {@link TrieNode}; otherwise an identity function
 * @template {{children: never, root: never}} T
 * @overload
 * @param {string} _key Object key
 * @param {T} value Corresponding value of `_key`; must not be structurally similar to a {@link Trie} or {@link TrieNode}
 * @returns {T} `value` itself
 */

/**
 * Reviver function for {@link JSON.parse} to instantiate a {@link PathTrie} from a {@link Trie}
 *
 * @overload
 * @param {string} _key Object key
 * @param {Trie} value Corresponding value of `_key` matching a {@link Trie}
 * @returns {PathTrie} A newly-instantiated {@link PathTrie}
 */

/**
 * Reviver function for {@link JSON.parse} to instantiate a {@link PathTrieNode} from a {@link TrieNode}
 *
 * @overload
 * @param {string} _key Object key
 * @param {TrieNode} value Corresponding value of `_key` matching a {@link TrieNode}
 * @returns {PathTrieNode} A newly-instantiated {@link PathTrieNode}
 */

/**
 * Reviver function for {@link JSON.parse} to instantiate a {@link PathTrie} from a {@link Trie}
 *
 * @param {string} _key
 * @param {any} value
 * @returns {any}
 */
export const revivePathTrie = (_key, value) => {
  // TODO: This is flimsy as hell. Either use a standard format for instantiating classes from JSON or just throw some sort of round-trippable special bit on the classes

  if (value && typeof value === 'object') {
    if (hasOwn(value, 'root')) {
      return new PathTrie(convertTrieNode(value.root));
    } else if (hasOwn(value, 'children')) {
      return convertTrieNode(value);
    }
  }
  return value;
};

/**
 * Helper function to instantiate a {@link PathTrieNode} from a {@link TrieNode}
 *
 * @param {TrieNode} trieNode
 * @returns {PathTrieNode}
 */
const convertTrieNode = trieNode => {
  const pathTrieNode = new PathTrieNode(trieNode.value);
  for (const [key, child] of Object.entries(trieNode.children)) {
    pathTrieNode.children[key] = convertTrieNode(child);
  }
  return pathTrieNode;
};
