// @ts-check
/* global setTimeout */
import harden from '@endo/harden';
import { Far } from '@endo/far';

/**
 * Resource maker for a timer capability, the first of the host-provided
 * system resources. Register it on the host as
 * `resources: { timer: makeTimerResource }` and grant it to a worker as
 * an `evaluate` endowment:
 *
 * ```js
 * const timer = host.makeResource('timer');
 * await worker.evaluate(source, ['timer'], [timer]);
 * ```
 *
 * Timers are nondeterministic, but the worker stays deterministic: every
 * timer result reaches the worker as a CapTP reply, which the host
 * journals before delivery, so replay reproduces the recorded answers
 * instead of consulting the clock again.
 *
 * A pending `delay` also gives the host a reason to wake a sleeping
 * worker without inbound traffic: the resolution message routes through
 * the worker's session and triggers the ordinary wake path.
 *
 * @param {unknown} [_description]
 * @returns {object}
 */
export const makeTimerResource = (_description = null) =>
  Far('SiestaTimer', {
    help: () =>
      'SiestaTimer: now() returns milliseconds since epoch; delay(ms) resolves with now() no sooner than ms from the call.',
    now: () => Date.now(),
    /** @param {number} ms */
    delay: async ms =>
      new Promise(resolve => setTimeout(() => resolve(Date.now()), Number(ms))),
  });
harden(makeTimerResource);
