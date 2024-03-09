/* eslint-disable @endo/restrict-comparison-operands */
/* eslint-disable no-use-before-define */
import { E } from '@endo/eventual-send';
import { getMethodNames } from '@endo/eventual-send/utils.js';
import { getInterfaceOf, passStyleOf, Remotable } from '@endo/pass-style';
import { X, makeError, q } from '@endo/errors';
import { makeMarshal } from './marshal.js';
import { assertEqualEnough, checkEqualEnough } from './equalEnough.js';

const { fromEntries, defineProperties } = Object;

/**
 * @typedef {'return'|'throw'} OutcomeKind
 */

/**
 * @typedef {{kind: 'return', result: any}
 *         | {kind: 'throw',  reason: any}
 * } Outcome
 */

/**
 * @param {import('@endo/pass-style').Passable} guestTarget
 * @param {any[]} hostLog
 */
export const makeReplayMembraneKit = async (guestTarget, hostLog) => {
  /** @type {WeakMap<any,any> | undefined} */
  let memoH2G = new WeakMap();
  /** @type {WeakMap<any,any> | undefined} */
  let memoG2H = new WeakMap();

  let optReason;
  /**
   * @type {import('./equalEnough.js').Rejector}
   */
  const reject = (template, ...subs) => {
    if (optReason === undefined) {
      optReason = makeError(X(template, ...subs), ReferenceError);
      memoH2G = undefined;
      memoG2H = undefined;
    }
    throw optReason;
  };

  /**
   * If < hostLog.length, the index of the next hostLog entry to interpret.
   * > Q: Why did the program counter increment?
   * > A: To get to the next instruction.
   *
   * Else must be === hostLog.length, in which case we're caught up
   * and should switch into pushing new hostLog entries.
   *
   * @type {number} hostLogIndex
   */
  let hostLogIndex = 0;

  const promiseMap = new WeakMap();

  const doHostLog = entry => {
    try {
      if (hostLogIndex < hostLog.length) {
        assertEqualEnough(entry, hostLog[hostLogIndex]);
      } else {
        hostLogIndex === hostLog.length ||
          reject`internal: unexpected hostLogIndex: ${q(hostLogIndex)}`;
        hostLog.push(entry);
      }
    } finally {
      hostLogIndex += 1;
    }
  };

  const checkHostLog = entry => {
    try {
      if (hostLogIndex < hostLog.length) {
        checkEqualEnough(entry, hostLog[hostLogIndex], reject);
      } else {
        hostLogIndex === hostLog.length ||
          reject`internal: unexpected hostLogIndex: ${q(hostLogIndex)}`;
        hostLog.push(entry);
      }
    } finally {
      hostLogIndex += 1;
    }
  };

  // ////////////// Host or Interpreter to Guest ///////////////////////////////

  const doFulfill = (hostPromise, hostFulfillment) => {
    doHostLog(['doFulfill', hostPromise, hostFulfillment]);
    promiseMap.get(hostPromise).hostResolve(hostFulfillment);
    promiseMap.delete(hostPromise);
  };

  const doReject = (hostPromise, hostReason) => {
    doHostLog(['doReject', hostPromise, hostReason]);
    promiseMap.get(hostPromise).hostReject(hostReason);
    promiseMap.delete(hostPromise);
  };

  /**
   * @param {Remotable} hostCap
   * @param {PropertyKey | undefined} optVerb
   * @param {any[]} hostArgs
   * @param {number} callIndex
   * @returns {Outcome}
   */
  const doCall = (hostCap, optVerb, hostArgs, callIndex) => {
    doHostLog(['doCall', hostCap, optVerb, hostArgs, callIndex]);
    const guestCap = hostToGuest(hostCap);
    const guestArgs = hostToGuest(hostArgs);
    let guestResult;
    try {
      guestResult =
        optVerb === undefined
          ? guestCap(...guestArgs)
          : guestCap[optVerb](...guestArgs);
    } catch (guestReason) {
      return checkThrow(callIndex, guestReason);
    }
    return checkReturn(callIndex, guestResult);
  };

  /**
   * @param {number} callIndex
   * @param {any} hostResult
   * @returns {Outcome}
   */
  const doReturn = (callIndex, hostResult) => {
    doHostLog(['doReturn', callIndex, hostResult]);
    unnestInterpreter(callIndex);
    const guestResult = hostToGuest(hostResult);
    return harden({
      kind: 'return',
      result: guestResult,
    });
  };

  /**
   * @param {number} callIndex
   * @param {any} hostReason
   * @returns {Outcome}
   */
  const doThrow = (callIndex, hostReason) => {
    doHostLog(['doThrow', callIndex, hostReason]);
    unnestInterpreter(callIndex);
    const guestReason = hostToGuest(hostReason);
    return harden({
      kind: 'throw',
      reason: guestReason,
    });
  };

  // ///////////// Guest to Host or consume log ////////////////////////////////

  const checkFulfill = (guestPromise, guestFulfillment) => {
    const hostPromise = guestToHost(guestPromise);
    const hostFulfillment = guestToHost(guestFulfillment);
    checkHostLog(['checkFulfill', hostPromise, hostFulfillment]);
    promiseMap.get(hostPromise).hostResolve(hostFulfillment);
    promiseMap.delete(hostPromise);
  };

  const checkReject = (guestPromise, guestReason) => {
    const hostPromise = guestToHost(guestPromise);
    const hostReason = guestToHost(guestReason);
    checkHostLog(['checkReject', hostPromise, hostReason]);
    promiseMap.get(hostPromise).hostReject(hostReason);
    promiseMap.delete(hostPromise);
  };

  /**
   * @param {Remotable} guestCap
   * @param {PropertyKey | undefined} optVerb
   * @param {any[]} guestArgs
   * @param {number} callIndex
   * @returns {Outcome}
   */
  const checkCall = (guestCap, optVerb, guestArgs, callIndex) => {
    const hostCap = guestToHost(guestCap);
    const hostArgs = guestToHost(guestArgs);
    checkHostLog(['checkCall', hostCap, optVerb, hostArgs, callIndex]);
    if (callIndex < hostLog.length) {
      // Simulate everything that happens ending with matching
      // doReturn or doThrow
      return nestInterpreter(callIndex);
    } else {
      // Running for real. Actually call the host function or method
      let hostResult;
      try {
        hostResult = optVerb
          ? hostCap[optVerb](...hostArgs)
          : hostCap(...hostArgs);
      } catch (hostReason) {
        return doThrow(callIndex, hostReason);
      }
      return doReturn(callIndex, hostResult);
    }
  };

  /**
   * @param {number} callIndex
   * @param {any} guestResult
   * @returns {Outcome}
   */
  const checkReturn = (callIndex, guestResult) => {
    const hostResult = hostToGuest(guestResult);
    checkHostLog(['checkReturn', callIndex, hostResult]);
    return harden({
      kind: 'return',
      result: hostResult,
    });
  };

  /**
   * @param {number} callIndex
   * @param {any} guestReason
   * @returns {Outcome}
   */
  const checkThrow = (callIndex, guestReason) => {
    const hostReason = hostToGuest(guestReason);
    checkHostLog(['checkThrow', callIndex, hostReason]);
    return harden({
      kind: 'throw',
      reason: hostReason,
    });
  };

  // //////////////////////// Log interpreters /////////////////////////////////

  const callIndexStack = [];

  let unnestFlag = false;

  const nestDispatch = harden({
    doCall,
    doReturn,
    doThrow,
  });

  const interpretEntry = (dispatch, [verb, ...args]) => dispatch[verb](...args);

  /**
   * @param {number} callIndex
   * @returns {Outcome}
   */
  const nestInterpreter = callIndex => {
    callIndexStack.push(callIndex);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      hostLogIndex < hostLog.length ||
        reject`log ended too soon: ${hostLogIndex}`;
      try {
        // eslint-disable-next-line no-await-in-loop
        const optOutcome = interpretEntry(nestDispatch, hostLog[hostLogIndex]);
        if (unnestFlag) {
          optOutcome || reject`only unnest with an outcome: ${q(hostLogIndex)}`;
          unnestFlag = false;
          return optOutcome;
        }
      } catch (problem) {
        reject`Playback stopped due to ${q(problem)}`;
      }
    }
  };

  /**
   * @param {number} callIndex
   */
  const unnestInterpreter = callIndex => {
    const stackLen = callIndexStack.length;
    (stackLen >= 1 && callIndexStack[stackLen - 1] === callIndex) ||
      reject`Unexpected call stack close: ${q(callIndex)}`;
    callIndexStack.pop();
    if (hostLogIndex < hostLog.length) {
      unnestFlag = true;
    } else {
      hostLogIndex === hostLog.length ||
        reject`internal: unexpected hostLogIndex: ${q(hostLogIndex)}`;
    }
  };

  const topDispatch = harden({
    doFulfill,
    doReject,
    doCall,
    checkFulfill,
    checkReject,
  });

  const topInterpreter = async () => {
    while (hostLogIndex < hostLog.length) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const optOutcome = interpretEntry(topDispatch, hostLog[hostLogIndex]);
        if (unnestFlag) {
          optOutcome || reject`only unnest with an outcome: ${q(hostLogIndex)}`;
          unnestFlag = false;
          return optOutcome;
        }
      } catch (problem) {
        reject`Playback stopped due to ${q(problem)}`;
      }
    }
    return undefined;
  };

  // ///////////////////////////////////////////////////////////////////////////

  const convertCapH2G = (hostCap, _optIface = undefined) => {
    if (memoH2G === undefined) {
      throw optReason;
    }
    assert(memoG2H !== undefined);
    if (memoH2G.has(hostCap)) {
      return memoH2G.get(hostCap);
    }
    let guestCap;
    const passStyle = passStyleOf(hostCap);
    switch (passStyle) {
      case 'promise': {
        let guestResolve;
        let guestReject;
        guestCap = harden(
          new Promise((res, rej) => {
            guestResolve = res;
            guestReject = rej;
          }),
        );
        const hostResolve = hostFulfillment => {
          guestResolve(hostToGuest(hostFulfillment));
        };
        const hostReject = hostReason => {
          guestReject(hostToGuest(hostReason));
        };
        promiseMap.set(hostCap, harden({ hostResolve, hostReject }));
        if (hostLogIndex >= hostLog.length) {
          assert(hostLogIndex === hostLog.length);
          // A real host, not the log replay
          E.when(
            hostCap,
            hostFulfillment => doFulfill(hostCap, hostFulfillment),
            hostReason => doReject(hostCap, hostReason),
          );
        }
        break;
      }
      case 'remotable': {
        /** @param {PropertyKey} [optVerb] */
        const makeGuestMethod = (optVerb = undefined) => {
          const guestMethod = (...guestArgs) => {
            const callIndex = hostLogIndex;
            return checkCall(guestCap, optVerb, guestArgs, callIndex);
          };
          if (optVerb) {
            defineProperties(guestMethod, {
              name: { value: String(optVerb) },
              length: { value: Number(hostCap[optVerb].length || 0) },
            });
          } else {
            defineProperties(guestMethod, {
              name: { value: String(hostCap.name || 'anon') },
              length: { value: Number(hostCap.length || 0) },
            });
          }
          return guestMethod;
        };
        const iface = String(getInterfaceOf(hostCap) || 'unlabeled remotable');
        if (typeof hostCap === 'function') {
          // NOTE: Assumes that a far function has no "static" methods. This
          // is the current marshal design, but revisit this if we change our
          // minds.
          guestCap = Remotable(iface, undefined, makeGuestMethod());
        } else {
          const methodNames = getMethodNames(hostCap);
          const guestMethods = methodNames.map(name => [
            name,
            makeGuestMethod(name),
          ]);
          guestCap = Remotable(iface, undefined, fromEntries(guestMethods));
        }
        break;
      }
      default: {
        reject`internal: Unrecognized passStyle ${passStyle}`;
      }
    }
    memoH2G.set(hostCap, guestCap);
    memoG2H.set(guestCap, hostCap);
    return guestCap;
  };

  const { toCapData: hostToHostCapData, fromCapData: guestFromHostCapData } =
    makeMarshal(
      undefined, // undefined is identity
      convertCapH2G, // convert a host slot to a guest value
      {
        serializeBodyFormat: 'smallcaps',
      },
    );

  const hostToGuest = hostVal => {
    const hostCapData = hostToHostCapData(harden(hostVal));
    const guestVal = guestFromHostCapData(hostCapData);
    return guestVal;
  };

  // ///////////////////////// Mirror image ////////////////////////////////////

  const convertCapG2H = (guestCap, _optIface = undefined) => {
    if (memoG2H === undefined) {
      throw optReason;
    }
    assert(memoH2G !== undefined);
    if (memoG2H.has(guestCap)) {
      return memoG2H.get(guestCap);
    }
    let hostCap;
    const passStyle = passStyleOf(guestCap);
    switch (passStyle) {
      case 'promise': {
        let hostResolve;
        let hostReject;
        hostCap = harden(
          new Promise((res, rej) => {
            hostResolve = res;
            hostReject = rej;
          }),
        );
        promiseMap.set(hostCap, harden({ hostResolve, hostReject }));
        E.when(
          guestCap,
          guestFulfillment => checkFulfill(guestCap, guestFulfillment),
          guestReason => checkReject(guestCap, guestReason),
        );
        break;
      }
      case 'remotable': {
        /** @param {PropertyKey} [optVerb] */
        const makeHostMethod = (optVerb = undefined) => {
          const hostMethod = (...hostArgs) => {
            const callIndex = hostLogIndex;
            return doCall(hostCap, optVerb, hostArgs, callIndex);
          };
          if (optVerb) {
            defineProperties(hostMethod, {
              name: { value: String(optVerb) },
              length: { value: Number(guestCap[optVerb].length || 0) },
            });
          } else {
            defineProperties(hostMethod, {
              name: { value: String(guestCap.name || 'anon') },
              length: { value: Number(guestCap.length || 0) },
            });
          }
          return hostMethod;
        };
        const iface = String(getInterfaceOf(guestCap) || 'unlabeled remotable');
        if (typeof guestCap === 'function') {
          // NOTE: Assumes that a far function has no "static" methods. This
          // is the current marshal design, but revisit this if we change our
          // minds.
          hostCap = Remotable(iface, undefined, makeHostMethod());
        } else {
          const methodNames = getMethodNames(guestCap);
          const hostMethods = methodNames.map(name => [
            name,
            makeHostMethod(name),
          ]);
          hostCap = Remotable(iface, undefined, fromEntries(hostMethods));
        }
        break;
      }
      default: {
        reject`internal: Unrecognized passStyle ${passStyle}`;
      }
    }
    memoG2H.set(guestCap, hostCap);
    memoH2G.set(hostCap, guestCap);
    return hostCap;
  };

  const { toCapData: guestToHostCapData, fromCapData: hostFromHostCapData } =
    makeMarshal(
      // convert from my value to a yellow slot. undefined is identity.
      convertCapG2H, // convert a guest value to a host slot
      undefined, // undefined is identity
      {
        serializeBodyFormat: 'smallcaps',
      },
    );

  const guestToHost = guestVal => {
    const hostCapData = guestToHostCapData(harden(guestVal));
    const hostVal = hostFromHostCapData(hostCapData);
    return hostVal;
  };

  if (hostLogIndex < hostLog.length) {
    const [firstVerb, firstArg, ..._rest] = hostLog[0];
    firstVerb === 'doCall' ||
      reject`First log entry be a "doCall", not ${q(firstVerb)}`;
    const hostTarget = firstArg;
    memoG2H.set(guestTarget, hostTarget);
    memoH2G.set(hostTarget, guestTarget);
  }

  await topInterpreter();

  return harden({
    hostProxy: guestToHost(guestTarget),
  });
};
harden(makeReplayMembraneKit);
