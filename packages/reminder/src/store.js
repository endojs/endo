// @ts-check

/**
 * The reminder service's durable store, backed by a writable virtual-file-
 * system directory (`@endo/platform/fs/extended`). The plugin depends only on
 * the reconciled writable-tree verbs (`lookup`, `list`, `write`,
 * `makeDirectory`, `remove`, `move`), so it cannot tell what backs the
 * directory - a host directory, an in-memory tree (tests), a daemon mount, or a
 * database-backed backend. There is no `node:fs` and no daemon `filePowers`.
 *
 * Layout under the store root:
 *
 * ```
 * reminder-store/
 *   config.json          # { maxActive, minPeriodMs, paused }
 *   reminders/
 *     <id>.json          # one document per reminder; nextTickAt is absolute epoch ms
 * ```
 *
 * Atomic replacement is write-then-`move` within one directory: the value is
 * written to a temporary sibling and then `move`d onto the final name. The
 * plugin **requires** atomic within-directory `move` of the backing as a store
 * contract (design decision 9); it does not rely on a direct `write` being
 * atomic, since that varies by backing and cannot be verified from here.
 */

import { E } from '@endo/eventual-send';

const CONFIG_NAME = 'config.json';
const REMINDERS_DIRECTORY = 'reminders';

/** @param {unknown} error */
const isEnoent = error =>
  /ENOENT/.test(String((error && /** @type {Error} */ (error).message) || ''));

/**
 * @param {import('./types.js').ReminderStoreDirectory} root - the store-root
 *   Directory cap (or an eventual reference to one).
 * @param {() => Promise<string>} makeId - unique-suffix generator for temporary files.
 * @returns {Promise<import('./types.js').ReminderStore>}
 */
export const makeReminderStore = async (root, makeId) => {
  await null;
  // Ensure the reminders subdirectory exists (makeDirectory is idempotent).
  const remindersDirectory = await E(root).makeDirectory(
    REMINDERS_DIRECTORY,
    {},
  );

  /**
   * Write-then-`move` atomic replacement within one directory.
   *
   * @param {import('./types.js').ReminderStoreDirectory} directory
   * @param {string} name
   * @param {unknown} value
   */
  const atomicWrite = async (directory, name, value) => {
    const suffix = await makeId();
    const temporaryName = `.tmp.${suffix}`;
    await E(directory).write(temporaryName, `${JSON.stringify(value)}\n`);
    await E(directory).move(temporaryName, name);
  };

  /**
   * Read and parse a JSON document, or `undefined` if it is absent.
   *
   * @param {import('./types.js').ReminderStoreDirectory} directory
   * @param {string} name
   */
  const readJSON = async (directory, name) => {
    await null;
    let file;
    try {
      file = await E(directory).lookup(name);
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
      return readJSON(root, CONFIG_NAME);
    },

    /** @param {unknown} config */
    async writeConfig(config) {
      return atomicWrite(root, CONFIG_NAME, config);
    },

    /**
     * Read every persisted reminder document. A single corrupt or partially
     * written entry must not brick recovery, so an unparseable file is skipped
     * with a warning rather than thrown (crash-safe persistence). Recovery
     * re-validates the parsed shape as well.
     *
     * @returns {Promise<any[]>}
     */
    async readAllReminders() {
      const cursor = await E(remindersDirectory).list();
      const directoryEntries = await E(cursor).toArray();
      /** @type {any[]} */
      const reminders = [];
      for (const { name, kind } of directoryEntries) {
        if (
          kind !== 'file' ||
          !name.endsWith('.json') ||
          name.startsWith('.tmp.')
        ) {
          // eslint-disable-next-line no-continue
          continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop
          const value = await readJSON(remindersDirectory, name);
          if (value !== undefined) {
            reminders.push(value);
          }
        } catch (error) {
          console.warn(
            `[reminder] skipping unparseable reminder entry ${name}:`,
            error,
          );
        }
      }
      return reminders;
    },

    /** @param {{ id: string }} entry */
    async writeReminder(entry) {
      return atomicWrite(remindersDirectory, `${entry.id}.json`, entry);
    },

    /** @param {string} id */
    async removeReminder(id) {
      await null;
      try {
        await E(remindersDirectory).remove(`${id}.json`);
      } catch (error) {
        if (!isEnoent(error)) {
          throw error;
        }
      }
    },
  });
};
harden(makeReminderStore);
