// @ts-check
/* global queueMicrotask */

/**
 * @file `@endo/quest` — promises and generator-driven async flows that surface
 * "promise shortening" as observable events.
 *
 * Standard `Promise` hides the moment when one promise's `resolve()` is called
 * with another thenable — the so-called *shortening* step. From the outside
 * you can only observe the eventually-fulfilled non-thenable value. `Quest`
 * is a `Promise` subclass that surfaces each shortening step via
 * `onShorten(listener)`. `saga(generatorFn)` runs a generator like an
 * `async` function and reports each `yield`ed thenable as a shortening step
 * on the resulting Quest.
 *
 * `Quest`'s `Symbol.species` is `Promise`, so `.then()` / `.catch()` /
 * `.finally()` return plain `Promise` instances. Only the directly
 * constructed instance (or a Quest produced by `saga`) is observable.
 */

/**
 * @typedef {(target: PromiseLike<unknown>) => void} ShortenListener
 */

/**
 * @typedef {object} QuestState
 * @property {ShortenListener[]} listeners Currently-subscribed listeners.
 * @property {PromiseLike<unknown>[]} history Every thenable adopted, in order.
 * @property {WeakMap<ShortenListener, number>} deliveredUpTo Highest history
 *   index already delivered to each listener; prevents double delivery
 *   between live fire and history replay.
 */

/** @type {WeakMap<Quest, QuestState>} */
const stateFor = new WeakMap();

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isThenable = value =>
  value !== null &&
  value !== undefined &&
  (typeof value === 'object' || typeof value === 'function');

/**
 * @param {ShortenListener} listener
 * @param {PromiseLike<unknown>} target
 */
const deliver = (listener, target) => {
  try {
    listener(target);
  } catch (_err) {
    // Listener errors must not affect resolution semantics.
  }
};

/**
 * Internal: record a shortening event on `quest` and notify subscribers.
 *
 * Listeners attached *after* `fire` was called still receive the event via
 * history replay in `onShorten`. The `deliveredUpTo` map dedupes between
 * the live-fire microtask and any pending replay microtask.
 *
 * @param {Quest} quest
 * @param {PromiseLike<unknown>} target
 */
const fire = (quest, target) => {
  const state = stateFor.get(quest);
  if (!state) return;
  state.history.push(target);
  const fireIndex = state.history.length - 1;
  queueMicrotask(() => {
    for (const listener of state.listeners.slice()) {
      const deliveredUpTo = state.deliveredUpTo.get(listener);
      if (deliveredUpTo === undefined || deliveredUpTo < fireIndex) {
        state.deliveredUpTo.set(listener, fireIndex);
        deliver(listener, target);
      }
    }
  });
};

export class Quest extends Promise {
  static get [Symbol.species]() {
    return Promise;
  }

  /**
   * @param {(
   *   resolve: (value: unknown) => void,
   *   reject: (reason: unknown) => void,
   * ) => void} executor
   */
  constructor(executor) {
    if (typeof executor !== 'function') {
      throw new TypeError('Quest resolver is not a function');
    }

    /** @type {(value: unknown) => void} */
    let nativeResolve = () => {};
    /** @type {(reason: unknown) => void} */
    let nativeReject = () => {};
    super((resolve, reject) => {
      nativeResolve = resolve;
      nativeReject = reject;
    });

    stateFor.set(this, {
      listeners: [],
      history: [],
      deliveredUpTo: new WeakMap(),
    });

    /** @param {unknown} value */
    const observingResolve = value => {
      if (isThenable(value)) {
        let then;
        try {
          // @ts-expect-error narrowed by isThenable
          then = value.then;
        } catch (err) {
          // Spec parity: a throwing `then` getter rejects the promise.
          nativeReject(err);
          return;
        }
        if (typeof then === 'function') {
          // Shortening detected: about to adopt this thenable.
          const target = /** @type {PromiseLike<unknown>} */ (value);
          fire(this, target);

          // If the target is itself a Quest, transitively forward its
          // shortening events so the head of the chain sees every step.
          if (target instanceof Quest) {
            target.onShorten(next => fire(this, next));
          }
        }
      }
      nativeResolve(value);
    };

    try {
      executor(observingResolve, nativeReject);
    } catch (err) {
      nativeReject(err);
    }
  }

  /**
   * Subscribe to shortening events. The listener is invoked once per
   * thenable this Quest adopts (transitively through other Quests). It
   * fires asynchronously, so a listener attached immediately after
   * construction still observes synchronous shortenings inside the
   * executor.
   *
   * @param {ShortenListener} listener
   * @returns {() => void} unsubscribe
   */
  onShorten(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('listener must be a function');
    }
    const state = stateFor.get(this);
    if (!state) return () => {};
    state.listeners.push(listener);
    if (state.history.length > 0) {
      const replayThrough = state.history.length - 1;
      queueMicrotask(() => {
        const lastDelivered = state.deliveredUpTo.get(listener);
        const start = lastDelivered === undefined ? 0 : lastDelivered + 1;
        for (let i = start; i <= replayThrough; i += 1) {
          deliver(listener, state.history[i]);
        }
        if (replayThrough >= start) {
          state.deliveredUpTo.set(listener, replayThrough);
        }
      });
    }
    return () => {
      const i = state.listeners.indexOf(listener);
      if (i >= 0) state.listeners.splice(i, 1);
    };
  }

  /**
   * Snapshot of every thenable this Quest has shortened to so far. Useful
   * for debugging and tests.
   *
   * @returns {ReadonlyArray<PromiseLike<unknown>>}
   */
  get shortenHistory() {
    const state = stateFor.get(this);
    return state ? state.history.slice() : [];
  }
}

/**
 * @template T
 * @typedef {Generator<unknown, T, unknown>} SagaGenerator
 */

/**
 * @template T
 * @typedef {(...args: unknown[]) => SagaGenerator<T>} SagaGeneratorFn
 */

/**
 * Run a generator function as an `async`-equivalent Saga: each `yield`
 * awaits its value and feeds the resolution back into the generator.
 *
 * Unlike a plain `async` function, the returned `Quest` exposes the
 * sequence of awaited thenables through `onShorten` — one event per
 * `yield`, plus one final event if the generator returns a thenable.
 *
 * Errors in the generator (synchronous throws or rejected awaits)
 * propagate to the Quest's rejection, with rejected awaits re-entering
 * the generator via `gen.throw()` so they can be caught by `try/catch`.
 *
 * @template T
 * @param {SagaGeneratorFn<T> | SagaGenerator<T>} genFnOrGen
 * @param {...unknown} args Forwarded to the generator function.
 * @returns {Quest}
 */
export const saga = (genFnOrGen, ...args) => {
  /** @type {(value: unknown) => void} */
  let resolveQuest = () => {};
  /** @type {(reason: unknown) => void} */
  let rejectQuest = () => {};
  const quest = new Quest((resolve, reject) => {
    resolveQuest = resolve;
    rejectQuest = reject;
  });

  /** @type {SagaGenerator<T>} */
  let gen;
  try {
    gen =
      typeof genFnOrGen === 'function'
        ? genFnOrGen(...args)
        : /** @type {SagaGenerator<T>} */ (genFnOrGen);
  } catch (err) {
    rejectQuest(err);
    return quest;
  }
  if (
    gen === null ||
    gen === undefined ||
    typeof (/** @type {any} */ (gen).next) !== 'function'
  ) {
    rejectQuest(
      new TypeError('saga expects a generator function or a generator'),
    );
    return quest;
  }

  // Track whether we've already settled, so a stray late callback can't
  // re-enter the generator after completion.
  let settled = false;

  /**
   * @param {'next' | 'throw'} method
   * @param {unknown} arg
   */
  const step = (method, arg) => {
    if (settled) return;
    /** @type {IteratorResult<unknown, T>} */
    let result;
    try {
      result =
        method === 'throw'
          ? gen.throw(arg)
          : gen.next(/** @type {any} */ (arg));
    } catch (err) {
      settled = true;
      rejectQuest(err);
      return;
    }

    const { value, done } = result;
    if (done) {
      settled = true;
      // If the return value is a thenable, observingResolve in Quest
      // fires a final shortening event and adopts its state.
      resolveQuest(value);
      return;
    }

    // Mid-flight yield: report the awaited value as a shortening step.
    if (isThenable(value)) {
      const thenable = /** @type {PromiseLike<unknown>} */ (value);
      fire(quest, thenable);
      if (thenable instanceof Quest) {
        thenable.onShorten(next => fire(quest, next));
      }
    }

    // Drive the generator forward once the awaited value settles.
    Promise.resolve(value).then(
      next => step('next', next),
      err => step('throw', err),
    );
  };

  // Start synchronously, matching async-fn semantics (the body runs up
  // to the first await before yielding control).
  step('next', undefined);
  return quest;
};
