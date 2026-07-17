// @ts-check

/** @import { ContentDataPlane, ContentIdentity } from './types.js' */
/** @import { ContentSourceHint } from './locator.js' */

import { makeError, q } from '@endo/errors';
import harden from '@endo/harden';

/**
 * Registry for the data planes that can contribute fresh source hints to a
 * content locator. A plane directory entry is a sharing capability named for
 * the registered plane. The registry deliberately does not fetch content yet:
 * Phase 4 attaches each plane's fetcher and Phase 5 supplies verification and
 * fallback ordering.
 */
export const makeContentDataPlaneRegistry = () => {
  /** @type {Map<string, ContentDataPlane>} */
  const planes = new Map();

  /**
   * @param {ContentDataPlane} plane
   */
  const register = plane => {
    if (
      plane === null ||
      typeof plane !== 'object' ||
      typeof plane.name !== 'string' ||
      plane.name === '' ||
      typeof plane.source !== 'function'
    ) {
      throw makeError(`Invalid content data plane ${q(plane)}`);
    }
    if (planes.has(plane.name)) {
      throw makeError(`Content data plane already registered: ${q(plane.name)}`);
    }
    planes.set(plane.name, plane);
  };

  /**
   * Resolve every registered plane represented in an agent's `@planes`
   * directory. Unknown directory entries are reserved for planes that have not
   * been registered by this daemon, so they intentionally contribute nothing.
   *
   * @param {Iterable<{ name: string, share: unknown }>} entries
   * @param {ContentIdentity} identity
   * @returns {Promise<ContentSourceHint[]>}
   */
  const getAllContentSources = async (entries, { hash, kind }) => {
    const sourceLists = await Promise.all(
      Array.from(entries, async ({ name, share }) => {
        const plane = planes.get(name);
        return plane === undefined ? [] : plane.source(hash, kind, share);
      }),
    );
    return sourceLists.flat();
  };

  return harden({ register, getAllContentSources });
};
