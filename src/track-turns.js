// @ts-nocheck
/* global assert globalThis */

// NOTE: We can't import these because they're not in scope before lockdown.
// import { assert, details as d } from '@agoric/assert';

// WARNING: Global Mutable State!
// This state is communicated to `assert` that makes it available to the
// causal console, which affects the console log output. Normally we
// regard the ability to see console log output as a meta-level privilege
// analogous to the ability to debug. Aside from that, this module should
// not have any observably mutable state.

let hiddenPriorError;
let hiddenCurrentTurn = 0;
let hiddenCurrentEvent = 0;

/**
 * @typedef {((...args: any[]) => any) | void} TurnStarterFn
 * An optional function that is not this-sensitive, expected to be called at
 * bottom of stack to start a new turn.
 */

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
 * @param {TurnStarterFn[]} funcs
 * @returns {TurnStarterFn[]}
 */
export const trackTurns = funcs => {
  if (typeof globalThis === 'undefined' || !globalThis.assert) {
    return funcs;
  }
  hiddenCurrentEvent += 1;
  const sendingError = new Error(
    `Event: ${hiddenCurrentTurn}.${hiddenCurrentEvent}`,
  );
  if (hiddenPriorError !== undefined) {
    assert.note(sendingError, assert.details`Caused by: ${hiddenPriorError}`);
  }

  return funcs.map(
    func =>
      func &&
      ((...args) => {
        hiddenPriorError = sendingError;
        hiddenCurrentTurn += 1;
        hiddenCurrentEvent = 0;
        try {
          return func(...args);
        } catch (err) {
          assert.note(
            err,
            assert.details`Thrown from: ${hiddenPriorError}:${hiddenCurrentTurn}.${hiddenCurrentEvent}`,
          );
          throw err;
        } finally {
          hiddenPriorError = undefined;
        }
      }),
  );
};
