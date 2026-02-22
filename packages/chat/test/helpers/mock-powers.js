// @ts-check

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';

/**
 * @typedef {object} MockPowersOptions
 * @property {string[]} [names] - Initial pet names
 * @property {Map<string, unknown>} [values] - Pet name to value mapping
 * @property {Map<string, string>} [ids] - Pet name to id mapping
 */

/**
 * @typedef {object} MockPowersResult
 * @property {ERef<EndoHost>} powers - The mock powers object (cast via unknown)
 * @property {(name: string) => void} addName - Add a pet name
 * @property {(name: string) => void} removeName - Remove a pet name
 * @property {(name: string, value: unknown, id?: string) => void} setValue
 * @property {Array<{ to: string, strings: string[], edgeNames: string[], petNames: string[] }>} sentMessages
 */

/**
 * Creates a mock powers object for testing chat components.
 * Implements the subset of the host interface used by chat components.
 *
 * @param {MockPowersOptions} [options]
 * @returns {MockPowersResult}
 */
export const makeMockPowers = ({
  names: initialNames = [],
  values = new Map(),
  ids = new Map(),
} = {}) => {
  // Make a mutable copy of names
  const names = [...initialNames];

  /** @type {Array<(value: { add: string } | { remove: string }) => void>} */
  const nameChangeResolvers = [];

  /** @type {Array<{ to: string, strings: string[], edgeNames: string[], petNames: string[] }>} */
  const sentMessages = [];

  /**
   * Create an async iterator that yields initial names then waits for changes.
   * @returns {AsyncIterator<{ add: string } | { remove: string }>}
   */
  const makeNameChangesIterator = () => {
    let initialIndex = 0;
    /** @type {import('@endo/promise-kit').PromiseKit<{ add: string } | { remove: string }> | null} */
    let pendingKit = null;

    const iterator = Far('NameChangesIterator', {
      /** @returns {Promise<IteratorResult<{ add: string } | { remove: string }>>} */
      async next() {
        // First yield all initial names
        if (initialIndex < names.length) {
          const name = names[initialIndex];
          initialIndex += 1;
          return { value: { add: name }, done: false };
        }

        // Then wait for changes
        if (!pendingKit) {
          pendingKit = makePromiseKit();
          nameChangeResolvers.push(value => {
            if (pendingKit) {
              pendingKit.resolve(value);
              pendingKit = null;
            }
          });
        }

        const value = await pendingKit.promise;
        return { value, done: false };
      },
    });

    return iterator;
  };

  const powers = Far('MockPowers', {
    /**
     * List all pet names.
     * @returns {AsyncIterable<string>}
     */
    list() {
      return Far('NameIterator', {
        [Symbol.asyncIterator]() {
          let index = 0;
          return Far('NameIteratorImpl', {
            async next() {
              if (index < names.length) {
                const value = names[index];
                index += 1;
                return { value, done: false };
              }
              return { value: undefined, done: true };
            },
          });
        },
      });
    },

    /**
     * Look up a value by pet name path.
     * Accepts either a string, an array, or rest args for compatibility.
     * @param {string | string[]} pathOrFirst
     * @param  {...string} rest
     * @returns {unknown}
     */
    lookup(pathOrFirst, ...rest) {
      /** @type {string[]} */
      let path;
      if (Array.isArray(pathOrFirst)) {
        path = pathOrFirst;
      } else if (typeof pathOrFirst === 'string') {
        path = rest.length > 0 ? [pathOrFirst, ...rest] : [pathOrFirst];
      } else {
        throw new Error(`Invalid path: ${pathOrFirst}`);
      }
      const key = path.join('.');
      if (!values.has(key)) {
        throw new Error(`Not found: ${key}`);
      }
      return values.get(key);
    },

    /**
     * Get the id for a pet name path.
     * @param  {...string} path
     * @returns {string | undefined}
     */
    identify(...path) {
      const key = path.join('.');
      return ids.get(key);
    },

    /**
     * Follow name changes as an async iterator.
     * @returns {AsyncIterator<{ add: string } | { remove: string }>}
     */
    followNameChanges() {
      return makeNameChangesIterator();
    },

    /**
     * Send a message.
     * @param {string} to
     * @param {string[]} strings
     * @param {string[]} edgeNames
     * @param {string[]} petNames
     */
    send(to, strings, edgeNames, petNames) {
      sentMessages.push({ to, strings, edgeNames, petNames });
    },

    /**
     * Store a value with a pet name.
     * @param {unknown} value
     * @param {string[]} petNamePath
     */
    storeValue(value, petNamePath) {
      const key = petNamePath.join('.');
      values.set(key, value);
      if (!names.includes(key)) {
        names.push(key);
        // Notify subscribers
        for (const resolve of nameChangeResolvers) {
          resolve({ add: key });
        }
      }
    },

    /**
     * Get pet names that have a given id.
     * @param {string} id
     * @returns {string[]}
     */
    reverseIdentify(id) {
      const result = [];
      for (const [name, nameId] of ids.entries()) {
        if (nameId === id) {
          result.push(name);
        }
      }
      return result;
    },
  });

  return {
    // Cast via unknown since mock doesn't implement full EndoHost interface
    powers,
    sentMessages,

    addName(name) {
      if (!names.includes(name)) {
        names.push(name);
        for (const resolve of nameChangeResolvers) {
          resolve({ add: name });
        }
      }
    },

    removeName(name) {
      const idx = names.indexOf(name);
      if (idx !== -1) {
        names.splice(idx, 1);
        for (const resolve of nameChangeResolvers) {
          resolve({ remove: name });
        }
      }
    },

    setValue(name, value, id) {
      values.set(name, value);
      if (id) {
        ids.set(name, id);
      }
      if (!names.includes(name)) {
        names.push(name);
      }
    },
  };
};
