// @ts-check
/**
 * Disembargo bookkeeping.
 *
 * When a promise import resolves to a remote cap that we want to address
 * directly, we must first ensure that any in-flight pipelined calls already
 * sent on the original promise have been delivered. Cap'n Proto solves this
 * with a `Disembargo { senderLoopback }` message: we send it on the original
 * path; the peer echoes it back as `receiverLoopback`. Until that echo
 * arrives, calls made *after* the resolve are queued.
 *
 * Combined with the Tribble rule (calls addressed to P stay routed via R),
 * this two-hop embargo is sufficient even in the 4-vat collapse scenario.
 */

import { makeIdAllocator } from './tables/id-allocator.js';

export const makeEmbargoTracker = () => {
  const ids = makeIdAllocator();
  /** @type {Map<number, () => void>} */
  const outstanding = new Map();

  return {
    /**
     * Allocate a senderLoopback id; the callback fires on echo.
     *
     * @param {() => void} onEcho
     */
    open(onEcho) {
      const id = ids.alloc();
      outstanding.set(id, onEcho);
      return id;
    },
    /**
     * Called when we receive a receiverLoopback echo from the peer.
     *
     * @param {number} id
     */
    echo(id) {
      const cb = outstanding.get(id);
      if (cb) {
        outstanding.delete(id);
        ids.release(id);
        cb();
      }
    },
    /** Stats for tests. */
    outstanding: () => outstanding.size,
  };
};
