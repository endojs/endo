// @ts-check

import { E } from '@endo/eventual-send';
import { makeError, q } from '@endo/errors';
import harden from '@endo/harden';
import { Far } from '@endo/pass-style';

/** @import { ContentKind, ContentSourceHint } from './locator.js' */

const httpProtocols = harden(['http:', 'https:']);

/**
 * Make the HTTP web-seed plane.  Its sharing capability is deliberately a
 * separate value: an agent's creator chooses whether to put it in `@planes`.
 *
 * @param {typeof fetch} [fetchImplementation]
 */
export const makeHttpContentDataPlane = (
  fetchImplementation = globalThis.fetch,
) => {
  if (typeof fetchImplementation !== 'function') {
    throw makeError('HTTP content plane requires fetch');
  }

  return harden({
    name: 'http',
    sourcePlanes: harden(['ws']),
    /**
     * @param {string} hash
     * @param {ContentKind} kind
     * @param {unknown} share
     * @returns {Promise<ContentSourceHint[]>}
     */
    async source(hash, kind, share) {
      return E(/** @type {any} */ (share)).source(hash, kind);
    },
    /**
     * Fetch bytes only.  The caller must hash and verify them before use.
     *
     * @param {ContentSourceHint} hint
     * @param {string} _hash
     * @param {ContentKind} _kind
     */
    async fetch(hint, _hash, _kind) {
      if (hint.plane !== 'ws') {
        throw makeError(`HTTP plane cannot fetch ${q(hint.plane)}`);
      }
      let url;
      try {
        url = new URL(hint.payload);
      } catch {
        throw makeError(`Invalid HTTP web-seed URL ${q(hint.payload)}`);
      }
      if (!httpProtocols.includes(url.protocol)) {
        throw makeError(`Invalid HTTP web-seed protocol ${q(url.protocol)}`);
      }
      const response = await fetchImplementation(url);
      if (!response.ok) {
        throw makeError(
          `HTTP web-seed request failed (${response.status} ${response.statusText})`,
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  });
};
harden(makeHttpContentDataPlane);

/**
 * Make the capability a Gateway vends into an agent's `@planes` directory.
 * Its sole authority is to advertise this Gateway's content route.
 *
 * @param {string} gatewayAddress
 */
export const makeHttpContentShare = gatewayAddress => {
  const base = new URL(gatewayAddress);
  if (!httpProtocols.includes(base.protocol)) {
    throw makeError(`Invalid Gateway HTTP address ${q(gatewayAddress)}`);
  }
  return Far('HTTP content share', {
    /** @param {string} hash @param {ContentKind} kind */
    source: async (hash, kind) => {
      const url = new URL(`content/${hash}`, base);
      // A tree's endpoint payload is its canonical tar archive.  The path is
      // still the content address; the query distinguishes the representation
      // without inventing another locator namespace.
      if (kind === 'tree') {
        url.searchParams.set('kind', 'tree');
      }
      return harden([{ plane: 'ws', payload: url.href }]);
    },
  });
};
harden(makeHttpContentShare);
