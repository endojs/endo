// @ts-check

import harden from '@endo/harden';
import { makeChangeTopic } from './pubsub.js';

/** @import { RetentionPath } from './graph.js' */

/**
 * A delta over the set of retention paths for a single target.
 *
 * The first delta in a subscription is always a `{ snapshot }`.
 * Subsequent deltas are `{ added, removed }` diffs computed by
 * structural equality of paths (see `pathKey` below).
 *
 * @typedef {object} RetentionPathDelta
 * @property {RetentionPath[]} [snapshot]
 * @property {RetentionPath[]} [added]
 * @property {RetentionPath[]} [removed]
 */

/**
 * Structural key for a `RetentionPath`. Two paths are equal iff
 * their segment sequence agrees on `referencedBy`, the ordered
 * `labels`, and the ordered `groupMembers`. Union-find group
 * composition shifts the `groupMembers` list, so a key change
 * faithfully reports a graph-shape change.
 *
 * Uses `\0` as field and segment separator. `\0` is rejected by
 * `isValidName` in `pet-name.js`, so it cannot appear inside a
 * `pet:<name>` label; formula identifiers are hex and likewise
 * cannot contain it. This rules out the ambiguity that a list
 * separator like `,` or `|` would create when a pet name
 * happened to contain the separator character.
 *
 * @param {RetentionPath} path
 * @returns {string}
 */
export const pathKey = path => {
  /** @type {string[]} */
  const parts = [];
  for (const seg of path) {
    parts.push(seg.referencedBy ?? '');
    parts.push((seg.labels ?? []).join('\0'));
    parts.push((seg.groupMembers ?? []).join('\0'));
    parts.push(seg.type ?? '');
  }
  return parts.join('\0\0');
};
harden(pathKey);

/**
 * Coalesce a stream of "recompute now" pings into batched
 * snapshot/delta emissions. The caller drives the accumulator by
 * calling `notify()` whenever the underlying graph may have
 * changed; the accumulator schedules a single recomputation per
 * batch window via `scheduleBatch` (default: `queueMicrotask`),
 * computes the new path set via `compute`, diffs it against the
 * previous snapshot, and publishes either a `snapshot` (on the
 * first flush) or `{ added, removed }` deltas.
 *
 * Match `retention-accumulator.js`'s shape: subscribers receive an
 * async generator that yields the snapshot first and then deltas;
 * dropping the iterator (or returning from a for-await-of loop)
 * terminates the producer.
 *
 * @param {object} opts
 * @param {() => Promise<RetentionPath[]> | RetentionPath[]} opts.compute
 *   Returns the current set of retention paths for the target.
 * @param {(flush: () => void) => void} [opts.scheduleBatch]
 *   Schedules a flush. Defaults to `queueMicrotask`.
 * @param {(err: unknown) => void} [opts.onError]
 *   Reports a flush failure. Defaults to a silent drop so library
 *   callers that do not wire a logger do not gain a `console.error`
 *   side-channel. The daemon-side caller wires this to the formula
 *   lifecycle log per `packages/daemon/AGENTS.md` § Diagnostic
 *   Discipline in Formulas.
 * @returns {{
 *   notify: () => void,
 *   subscribe: () => AsyncGenerator<RetentionPathDelta>,
 * }}
 */
export const makeRetentionPathAccumulator = ({
  compute,
  scheduleBatch = fn => void Promise.resolve().then(fn),
  onError = () => {},
}) => {
  /** @type {import('./types.js').Topic<RetentionPathDelta>} */
  const topic = makeChangeTopic();

  /** @type {Map<string, RetentionPath>} */
  let lastByKey = new Map();
  let primed = false;
  let pending = false;
  let scheduled = false;

  const flush = async () => {
    scheduled = false;
    if (!pending) return;
    pending = false;
    const paths = await compute();
    /** @type {Map<string, RetentionPath>} */
    const nextByKey = new Map();
    for (const p of paths) {
      nextByKey.set(pathKey(p), p);
    }

    if (!primed) {
      primed = true;
      lastByKey = nextByKey;
      topic.publisher.next(harden({ snapshot: [...nextByKey.values()] }));
      return;
    }

    /** @type {RetentionPath[]} */
    const added = [];
    /** @type {RetentionPath[]} */
    const removed = [];
    for (const [k, v] of nextByKey) {
      if (!lastByKey.has(k)) added.push(v);
    }
    for (const [k, v] of lastByKey) {
      if (!nextByKey.has(k)) removed.push(v);
    }
    lastByKey = nextByKey;
    if (added.length > 0 || removed.length > 0) {
      topic.publisher.next(harden({ added, removed }));
    }
  };

  const scheduleIfNeeded = () => {
    if (!scheduled) {
      scheduled = true;
      scheduleBatch(() => {
        flush().catch(err => {
          onError(err);
        });
      });
    }
  };

  const notify = () => {
    pending = true;
    scheduleIfNeeded();
  };

  /**
   * Subscribe to the path stream. First yielded delta is always a
   * `{ snapshot }`. Subsequent deltas are `{ added, removed }`.
   * Drop the iterator to terminate the producer.
   *
   * Late subscribers (subscribing after the accumulator has already
   * primed) receive a synthetic snapshot built from the last-known
   * path set, matching `retention-accumulator.js`'s yield-snapshot-
   * first contract.
   *
   * @returns {AsyncGenerator<RetentionPathDelta>}
   */
  const subscribe = () => {
    const subscription = topic.subscribe();
    /** @type {RetentionPathDelta | undefined} */
    let primedSnapshot;
    if (primed) {
      // Late subscriber: replay the last-known path set as a
      // synthetic snapshot. The downstream `for await` then picks
      // up any subsequent diff deltas from the live subscription.
      primedSnapshot = harden({ snapshot: [...lastByKey.values()] });
    } else {
      // First subscriber: prime the snapshot so consumers receive
      // it promptly even when no graph changes have happened yet.
      notify();
    }
    return (async function* retentionPathDeltas() {
      if (primedSnapshot !== undefined) {
        yield primedSnapshot;
      }
      for await (const delta of subscription) {
        yield delta;
      }
    })();
  };

  return harden({ notify, subscribe });
};
harden(makeRetentionPathAccumulator);
