// @ts-check

/**
 * The fetch service's durable store, backed by a writable virtual-file-system
 * directory (`@endo/platform/fs/extended`). The plugin depends only on the
 * reconciled writable-tree verbs (`lookup`, `write`, `move`), so it cannot tell
 * what backs the directory - a host directory, an in-memory tree (tests), a
 * daemon mount, or a database-backed backend. There is no `node:fs` and no
 * daemon `filePowers`.
 *
 * Layout under the store root:
 *
 * ```
 * fetch-store/
 *   config.json    # { allowedOrigins, maxRequestsPerMinute, maxResponseBytes,
 *                  #   policyMode, revoked } - the PolicyShape fields
 *   bindings.json  # the trust-on-first-bind binding table: an array of
 *                  #   { target, state, decidedAt, decidedBy, decisionMode, note? }
 * ```
 *
 * Both documents are single files rather than per-entry directories: the
 * cardinality is one service per guest with tens of origins and pins, so an
 * O(N) rewrite per policy change costs nothing.
 *
 * Atomic replacement is write-then-`move` within one directory: the value is
 * written to a temporary sibling and then `move`d onto the final name. The
 * plugin **requires** atomic within-directory `move` of the backing as a store
 * contract (design decision 5); it does not rely on a direct `write` being
 * atomic, since that varies by backing and cannot be verified from here.
 */

import { E } from '@endo/eventual-send';

const CONFIG_NAME = 'config.json';
const BINDINGS_NAME = 'bindings.json';

/** @param {unknown} error */
const isEnoent = error => {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(/** @type {{ message: unknown }} */ (error).message)
      : '';
  return /ENOENT/.test(message);
};

/**
 * @param {import('./types.js').FetchStoreDirectory} root - the store-root
 *   Directory cap (or an eventual reference to one).
 * @param {() => Promise<string>} makeId - unique-suffix generator for temporary files.
 * @returns {Promise<import('./types.js').FetchStore>}
 */
export const makeFetchStore = async (root, makeId) => {
  await null;

  /**
   * Write-then-`move` atomic replacement within the store root.
   *
   * @param {string} name
   * @param {unknown} value
   */
  const atomicWrite = async (name, value) => {
    const suffix = await makeId();
    const temporaryName = `.tmp.${suffix}`;
    await E(root).write(temporaryName, `${JSON.stringify(value)}\n`);
    await E(root).move(temporaryName, name);
  };

  /**
   * Read and parse a JSON document, or `undefined` if it is absent.
   *
   * @param {string} name
   */
  const readJSON = async name => {
    await null;
    let file;
    try {
      file = await E(root).lookup(name);
    } catch (error) {
      if (isEnoent(error)) {
        return undefined;
      }
      throw error;
    }
    const blob = await E(file).snapshot();
    return E(blob).json();
  };

  return harden({
    /** @returns {Promise<any>} */
    async readConfig() {
      return readJSON(CONFIG_NAME);
    },

    /** @param {unknown} config */
    async writeConfig(config) {
      return atomicWrite(CONFIG_NAME, config);
    },

    /**
     * Read the persisted binding table. A corrupt or partially written file
     * must not brick recovery, so an unparseable document is treated as absent
     * with a warning rather than thrown (crash-safe persistence); the service
     * then comes up with only its static allowlist, which fails closed.
     *
     * @returns {Promise<any[] | undefined>}
     */
    async readBindings() {
      await null;
      try {
        return /** @type {any[]} */ (await readJSON(BINDINGS_NAME));
      } catch (error) {
        console.warn('[fetch] skipping unparseable bindings.json:', error);
        return undefined;
      }
    },

    /** @param {ReadonlyArray<unknown>} bindings */
    async writeBindings(bindings) {
      return atomicWrite(BINDINGS_NAME, bindings);
    },
  });
};
harden(makeFetchStore);
