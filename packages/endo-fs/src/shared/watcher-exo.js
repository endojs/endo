// @ts-check
/* eslint-disable no-await-in-loop */
/**
 * Build a `NodeWatcher` exo over a backend's `watch?(path)` iterable
 * (if present) and a wrap-backend-local event bus (always present,
 * carries events that originate at the wrap-backend layer — xattrs
 * mutations etc).
 *
 * Events from both sources interleave into one queue. On backend-
 * iterator error the pump calls `close()` in a `finally`, which
 * unblocks any pending consumer with stream-done — without that,
 * a backend.watch that throws would let an `iter.next()` hang
 * forever.
 */

import { makeExo } from '@endo/exo';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';

import { NodeWatcherInterface } from '../type-guards.js';

/**
 * @param {object} opts
 * @param {boolean} opts.hasWatch        whether `backend.watch` is callable
 * @param {() => AsyncIterable<any>} opts.backendWatch  () => backend.watch(path)
 * @param {Map<string, Set<(e: any) => void>>} opts.localSubs
 * @param {string} opts.subKey  the localSubs key (typically `lockKeyOf(path)`)
 */
export const makeNodeWatcherExo = ({
  hasWatch,
  backendWatch,
  localSubs,
  subKey,
}) => {
  /** @type {any[]} */
  const buffer = [];
  /** @type {Array<(value: any) => void>} */
  const waiters = [];
  let cancelled = false;

  const enqueue = event => {
    if (cancelled) return;
    if (waiters.length !== 0) {
      const resolve = /** @type {(v: any) => void} */ (waiters.shift());
      resolve(harden(event));
    } else {
      buffer.push(harden(event));
    }
  };

  // Subscribe to wrap-backend-local events for this path.
  let subs = localSubs.get(subKey);
  if (!subs) {
    subs = new Set();
    localSubs.set(subKey, subs);
  }
  subs.add(enqueue);

  /** @type {AsyncIterator<any> | null} */
  let backendIter = null;

  const close = async () => {
    if (cancelled) return;
    cancelled = true;
    if (subs) {
      subs.delete(enqueue);
      if (subs.size === 0) localSubs.delete(subKey);
    }
    while (waiters.length !== 0) {
      const resolve = /** @type {(v: any) => void} */ (waiters.shift());
      resolve(undefined);
    }
    if (backendIter !== null) {
      try {
        if (typeof backendIter.return === 'function') {
          await backendIter.return(undefined);
        }
      } catch (_e) {
        // ignore
      }
    }
  };

  // Pump backend.watch?(path) events into the same queue. On
  // backend iterator error, close the watcher so consumers see
  // the stream terminate rather than blocking on a never-resolved
  // waiter.
  if (hasWatch) {
    const iterable = backendWatch();
    backendIter = iterable[Symbol.asyncIterator]();
    (async () => {
      try {
        while (!cancelled) {
          const step = await /** @type {AsyncIterator<any>} */ (
            backendIter
          ).next();
          if (step.done) return;
          enqueue(step.value);
        }
      } catch (_e) {
        // ignore — close below
      } finally {
        // Unblock any pending consumer; the stream is done.
        close().catch(() => {});
      }
    })();
  }

  // Build an async generator that yields events from buffer/waiters.
  const generator = async function* () {
    while (!cancelled) {
      if (buffer.length !== 0) {
        yield buffer.shift();
        // eslint-disable-next-line no-continue
        continue;
      }
      const event = await new Promise(resolve => {
        waiters.push(resolve);
      });
      if (event === undefined) return; // cancelled
      yield event;
    }
  };

  return makeExo('NodeWatcher', NodeWatcherInterface, {
    async events() {
      return readerFromIterator(generator());
    },
    async cancel() {
      await close();
    },
  });
};
harden(makeNodeWatcherExo);
