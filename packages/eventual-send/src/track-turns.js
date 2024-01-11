/* global globalThis */
import {
  getEnvironmentOption,
  environmentOptionsListHas,
} from '@endo/env-options';

// NOTE: We can't import these because they're not in scope before lockdown.
// import { assert, details as X, Fail } from '@agoric/assert';

// WARNING: Global Mutable State!
// This state is communicated to `assert` that makes it available to the
// causal console, which affects the console log output. Normally we
// regard the ability to see console log output as a meta-level privilege
// analogous to the ability to debug. Aside from that, this module should
// not have any observably mutable state.

let hiddenPriorError;
let hiddenCurrentTurn = 0;
let hiddenCurrentEvent = 0;

// Turn on if you seem to be losing error logging at the top of the event loop
const VERBOSE = environmentOptionsListHas('DEBUG', 'track-turns');

// Track-turns is disabled by default and can be enabled by an environment
// option.
const ENABLED =
  getEnvironmentOption('TRACK_TURNS', 'disabled', ['enabled']) === 'enabled';

// We hoist the following functions out of trackTurns() to discourage the
// closures from holding onto 'args' or 'func' longer than necessary,
// which we've seen cause HandledPromise arguments to be retained for
// a surprisingly long time.

const addRejectionNote = detailsNote => reason => {
  if (reason instanceof Error) {
    assert.note(reason, detailsNote);
  }
  if (VERBOSE) {
    console.log('REJECTED at top of event loop', reason);
  }
};

const wrapFunction =
  (func, sendingError, X) =>
  (...args) => {
    hiddenPriorError = sendingError;
    hiddenCurrentTurn += 1;
    hiddenCurrentEvent = 0;
    try {
      let result;
      try {
        result = func(...args);
      } catch (err) {
        if (err instanceof Error) {
          assert.note(
            err,
            X`Thrown from: ${hiddenPriorError}:${hiddenCurrentTurn}.${hiddenCurrentEvent}`,
          );
        }
        if (VERBOSE) {
          console.log('THROWN to top of event loop', err);
        }
        throw err;
      }
      // Must capture this now, not when the catch triggers.
      const detailsNote = X`Rejection from: ${hiddenPriorError}:${hiddenCurrentTurn}.${hiddenCurrentEvent}`;
      Promise.resolve(result).catch(addRejectionNote(detailsNote));
      return result;
    } finally {
      hiddenPriorError = undefined;
    }
  };

/**
 * Given a list of `TurnStarterFn`s, returns a list of `TurnStarterFn`s whose
 * `this`-free call behaviors are not observably different to those that
 * cannot see console output. The only purpose is to cause additional
 * information to appear on the console.
 *
 * The call to `trackTurns` is itself a sending event, that occurs in some call
 * stack in some turn number at some event number within that turn. Each call
 * to any of the returned `TurnStartFn`s is a receiving event that begins a new
 * turn. This sending event caused each of those receiving events.
 *
 * @template {TurnStarterFn[]} T
 * @param {T} funcs
 * @returns {T}
 */
export const trackTurns = funcs => {
  if (!ENABLED || typeof globalThis === 'undefined' || !globalThis.assert) {
    return funcs;
  }
  const { details: X } = assert;

  hiddenCurrentEvent += 1;
  const sendingError = Error(
    `Event: ${hiddenCurrentTurn}.${hiddenCurrentEvent}`,
  );
  if (hiddenPriorError !== undefined) {
    assert.note(sendingError, X`Caused by: ${hiddenPriorError}`);
  }

  return /** @type {T} */ (
    funcs.map(func => func && wrapFunction(func, sendingError, X))
  );
};

/**
 * An optional function that is not this-sensitive, expected to be called at
 * bottom of stack to start a new turn.
 *
 * @typedef {((...args: any[]) => any) | undefined} TurnStarterFn
 */
