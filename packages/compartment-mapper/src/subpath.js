import { escapeRegExp } from '@endo/regexp-escape';

const { isArray } = Array;
const { hasOwn, create, entries } = Object;

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
 * @typedef TrieNode
 * @property {SubpathParts|null} value
 * @property {Record<string, TrieNode>} children
 */

/**
 * @typedef Trie
 * @property {TrieNode} root
 */

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
  /** @type {SubpathParts|null} */
  value;

  /**
   * Mapping of path parts ("prefixes") to child {@link PathTrieNode}s
   *
   * @type {Record<string, PathTrieNode>}
   */
  children;

  /**
   *
   * @param {SubpathParts|null} [value=null]
   */
  constructor(value = null) {
    this.children = create(null);
    this.value = value;
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
 * @internal
 * @implements {Trie}
 */
export class PathTrie {
  /** @type {PathTrieNode} */
  root;

  constructor() {
    this.root = new PathTrieNode();
  }

  /**
   *
   * @param {string} pattern
   * @param {string} replacement
   */
  insert(pattern, replacement) {
    let node = this.root;
    const patternParts = pattern.split(PATH_SEP);
    const replacementParts = replacement.split(PATH_SEP);

    for (const part of patternParts) {
      node = node.appendChild(part, new PathTrieNode());
    }
    node.value = { replacementParts, patternParts };
  }

  /**
   * Recursive search implementation
   *
   * @param {PathTrieNode} node
   * @param {string[]} textParts
   * @param {number} offset
   * @returns {SubpathParts|null}
   */
  #search(node, textParts, offset = 0) {
    if (offset === textParts.length) {
      return node.value;
    }

    const part = textParts[offset];

    if (hasOwn(node.children, part)) {
      const result = this.#search(node.children[part], textParts, offset + 1);
      if (result) {
        return result;
      }
    }

    if (hasOwn(node.children, WILDCARD)) {
      return this.#search(node.children[WILDCARD], textParts, offset + 1);
    }

    return null;
  }

  /**
   * Searches for a pattern in the `Trie` from the root node.
   *
   * Returns `null` if pattern not matched
   *
   * @param {string} pattern Pattern to match
   * @returns {SubpathParts|null}
   */
  search(pattern) {
    return this.#search(this.root, pattern.split(PATH_SEP));
  }
}

/**
 * @typedef SubpathParts
 * @property {string[]} replacementParts
 * @property {string[]} patternParts
 */

/**
 * Function which replaces a specifier with the corresponding replacement path if possible
 *
 * @callback SubpathReplacer
 * @param {string} text Text to match (generally a package-relative path)
 * @returns {string | null} `null` if no replacement found
 */

/**
 * Acceptable input for {@link makeMultiSubpathReplacer}
 *
 * @typedef {Record<string, string>|[pattern: string, replacement: string][]} SubpathMapping
 */

/**
 * Factory for a {@link SubpathReplacer}
 *
 * @param {SubpathMapping} mapping a record where the key is the pattern and the value is the replacement
 * @return {SubpathReplacer}
 */
export const makeMultiSubpathReplacer = mapping => {
  const trie = new PathTrie();

  const mappingEntries = isArray(mapping) ? mapping : entries(mapping);
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
    if (value.root && value.root.children) {
      const pathTrie = new PathTrie();
      pathTrie.root = convertTrieNode(value.root);
      return pathTrie;
    } else if (value.children) {
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
