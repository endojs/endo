// @ts-check
/**
 * Helpers that sweep `Map<path-key, ...>` tables on `remove` and
 * `rename`. Used by `wrapBackend` to keep its `statTable`,
 * `xattrTable`, and watcher-subscriber tables in sync with the
 * underlying backend operations.
 *
 * Without these, a long-running daemon's tables grow unboundedly
 * (every removed path stays in the maps forever) and a removed-
 * and-recreated path inherits its predecessor's ghost metadata.
 */

const SEP = '\0';

/**
 * Remove every entry under `path` from `maps`. For each map, both
 * the key matching `lockKeyOf(path)` and any key prefixed with
 * `lockKeyOf(path) + SEP` (i.e. children of `path`) are dropped.
 *
 * @param {string[]} path
 * @param {(path: string[]) => string} lockKeyOf
 * @param {Array<Map<string, unknown>>} maps
 */
export const cleanupPathTables = (path, lockKeyOf, maps) => {
  const selfKey = lockKeyOf(path);
  const prefix = path.length === 0 ? '' : `${selfKey}${SEP}`;
  for (const map of maps) {
    const toDelete = [];
    for (const key of map.keys()) {
      if (key === selfKey || (prefix !== '' && key.startsWith(prefix))) {
        toDelete.push(key);
      }
    }
    for (const key of toDelete) map.delete(key);
  }
};
harden(cleanupPathTables);

/**
 * Move every entry under `srcPath` to `dstPath` in `maps`. Used on
 * `rename` so metadata follows the data.
 *
 * @param {string[]} srcPath
 * @param {string[]} dstPath
 * @param {(path: string[]) => string} lockKeyOf
 * @param {Array<Map<string, unknown>>} maps
 */
export const transplantPathTables = (srcPath, dstPath, lockKeyOf, maps) => {
  const srcKey = lockKeyOf(srcPath);
  const dstKey = lockKeyOf(dstPath);
  const srcPrefix = `${srcKey}${SEP}`;
  const dstPrefix = `${dstKey}${SEP}`;
  for (const map of maps) {
    /** @type {Array<[string, unknown]>} */
    const moves = [];
    for (const [key, value] of map) {
      if (key === srcKey) {
        moves.push([dstKey, value]);
        map.delete(key);
      } else if (key.startsWith(srcPrefix)) {
        moves.push([dstPrefix + key.slice(srcPrefix.length), value]);
        map.delete(key);
      }
    }
    for (const [newKey, value] of moves) map.set(newKey, value);
  }
};
harden(transplantPathTables);
