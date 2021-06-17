// @ts-check

/**
 * This file drives the trap takeReply and giveReply iterators.
 *
 * On the Guest side, the takeIt is given next(true).  If it returns, that's the
 * end of the cycle.
 *
 * If it yields, then the initTrap function is called.  For all subsequent
 * iterations, it is given next(false). If it yields, the nextBuffer function is
 * called with buffer iteration parameters.
 *
 * On the Host side, sendTrapReply should be called when the answer from the
 * initTrap step has settled.  Calling the trapNextBuffer function with the
 * trapID and supplied buffer iteration parameters will rev the giveIt to
 * transfer buffers to the takeIt.
 */

import { assert, details as X } from '@agoric/assert';

import './types';

// Something to make our reply sequences more interesting.
const TRAP_FIRST_SEQUENCE_NUMBER = 23;

/**
 * @param {any} maybeThenable
 * @returns {boolean}
 */
const isThenable = maybeThenable =>
  maybeThenable && typeof maybeThenable.then === 'function';

/**
 * Create the host side of the trap interface.
 */
export const makeTrapHost = () => {
  /** @type {Map<number, (data: any, nonce: number) => void>} */
  const trapIDToNextBuffer = new Map();

  return {
    /**
     * @param {any} trapID
     * @param {ReturnType<GiveTrapReply>} giveIt
     */
    sendTrapReply: async (trapID, giveIt) => {
      assert(
        !trapIDToNextBuffer.has(trapID),
        X`Trap ID ${trapID} is already in progress`,
      );

      // Allow the caller to iterate via `trapNextBuffer` messages.
      let nextSeq = TRAP_FIRST_SEQUENCE_NUMBER;
      let pendingP;
      /**
       * @param {number} seq
       * @param {any} data
       */
      const nextInSequence = async (seq, data) => {
        // Prevent parallel requests for a given sequence number.
        await pendingP;
        assert.equal(
          seq,
          nextSeq,
          X`Invalid trapNextBuffer; seq ${seq} is not ${nextSeq}`,
        );
        nextSeq += 1;
        pendingP = giveIt.next(data);
        const status = await pendingP;
        if (status.done) {
          // No more "nexts" are required, so clean up.
          trapIDToNextBuffer.delete(trapID);
        }
      };
      trapIDToNextBuffer.set(trapID, nextInSequence);

      // Prime the pump with the first iteration.
      await nextInSequence(nextSeq, undefined);
    },
    // Send the next part of a "trap" call's result.
    trapNextBuffer: async (trapID, trapParams) => {
      const { data, seq } = trapParams;
      const nextInSequence = trapIDToNextBuffer.get(trapID);
      assert(nextInSequence);
      return nextInSequence(seq, data);
    },
  };
};

/**
 * Create the guest side of the trap interface.
 *
 * @param {(ser: any) => any} unserialize
 */
export const makeTrapGuest = unserialize => {
  return {
    /**
     * @param {ReturnType<TakeTrapReply>} takeIt
     * @param {() => void} [initTrap]
     * @param {(trapParams: any) => void} [nextBuffer]
     */
    doTrap: (takeIt, initTrap = undefined, nextBuffer = undefined) => {
      /**
       * @param {boolean} firstTime
       */
      const nextTrap = firstTime => {
        const status = takeIt.next(firstTime);
        assert(
          !isThenable(status),
          X`takeTrapReply must be a fully-synchronous Generator but it.next() returned a Thenable ${status}`,
        );
        return status;
      };

      // Prepare the reply, in case there needs to be something initialized
      // before the call is ready.
      let firstTime = true;
      let status = nextTrap(firstTime);
      let seq = TRAP_FIRST_SEQUENCE_NUMBER;
      while (!status.done) {
        if (firstTime) {
          // Mark the send as a "trap", but handle it asynchronously on the
          // other side.
          assert.typeof(
            initTrap,
            'function',
            X`Trap() initTrap function must be defined`,
          );
          firstTime = false;
          initTrap();
        } else {
          // We weren't done fetching the entire result in the first iteration,
          // so thread through the iterator values into the "next" messages to
          // retrieve the entire serialized data.
          assert.typeof(
            nextBuffer,
            'function',
            X`Trap() nextBuffer function must be defined`,
          );
          seq += 1;
          nextBuffer({
            seq,
            data: status.value,
          });
        }
        status = nextTrap(firstTime);
      }

      // We've finished claiming the return value.
      const [isReject, serialized] = status.value;
      const value = unserialize(serialized);
      assert(
        !isThenable(value),
        X`Trap() reply cannot be a Thenable; have ${value}`,
      );
      if (isReject) {
        throw value;
      }
      return value;
    },
  };
};
