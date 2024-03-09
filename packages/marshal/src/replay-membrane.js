/* eslint-disable @endo/restrict-comparison-operands */
/* eslint-disable no-use-before-define */
import { E } from '@endo/eventual-send';
import { getMethodNames } from '@endo/eventual-send/utils.js';
import { getInterfaceOf, passStyleOf, Remotable } from '@endo/pass-style';
import { Fail, X, makeError, q } from '@endo/errors';
import { makeMarshal } from './marshal.js';
import { assertEqualEnough, checkEqualEnough } from './equalEnough.js';

const { fromEntries, defineProperties } = Object;

/**
 * @param {'return'|'throw'|'halt'} kind
 * @param {any} payload
 */
// const makeOutcome = (kind, payload) => harden({ kind, payload });

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

  const callIndexStack = [];

  let unnestFlag = false;

  const promiseMap = new WeakMap();

  const doHostLog = entry => {
    try {
      if (hostLogIndex < hostLog.length) {
        assertEqualEnough(entry, hostLog[hostLogIndex]);
      } else {
        hostLogIndex === hostLog.length ||
          Fail`internal: unexpected hostLogIndex: ${q(hostLogIndex)}`;
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
          Fail`internal: unexpected hostLogIndex: ${q(hostLogIndex)}`;
        hostLog.push(entry);
      }
    } finally {
      hostLogIndex += 1;
    }
  };

  const nestInterpreter = callIndex => {
    callIndexStack.push(callIndex);
    while (hostLogIndex < hostLog.length) {
      try {
        const result = interpretEntry(hostLog[hostLogIndex]);
        if (unnestFlag) {
          unnestFlag = false;
          return result;
        }
      } catch (reason) {
        if (unnestFlag) {
          unnestFlag = false;
          throw reason;
        }
        reject`Playback stopped due to ${q(reason)}`;
      }
    }
    return undefined;
  };

  const unnestInterpreter = callIndex => {
    const stackLen = callIndexStack.length;
    (stackLen >= 1 && callIndexStack[stackLen - 1] === callIndex) ||
      Fail`Unexpected call stack close: ${q(callIndex)}`;
    callIndexStack.pop();
    if (hostLogIndex < hostLog.length) {
      unnestFlag = true;
    } else {
      hostLogIndex === hostLog.length ||
        Fail`internal: unexpected hostLogIndex: ${q(hostLogIndex)}`;
    }
  };

  // eslint-disable-next-line no-unused-vars
  const dispatch = harden({
    doFulfill(hostPromise, hostFulfillment) {
      doHostLog(['doFulfill', hostPromise, hostFulfillment]);
      promiseMap.get(hostPromise).hostResolve(hostFulfillment);
      promiseMap.delete(hostPromise);
    },

    doReject(hostPromise, hostReason) {
      doHostLog(['doReject', hostPromise, hostReason]);
      promiseMap.get(hostPromise).hostReject(hostReason);
      promiseMap.delete(hostPromise);
    },

    checkCall(guestCap, optVerb, guestArgs, callIndex) {
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
          throw dispatch.doThrow(callIndex, hostReason);
        }
        return dispatch.doReturn(callIndex, hostResult);
      }
    },

    doReturn(callIndex, hostResult) {
      doHostLog(['doReturn', callIndex, hostResult]);
      unnestInterpreter(callIndex);
      const guestResult = hostToGuest(hostResult);
      return guestResult;
    },

    doThrow(callIndex, hostReason) {
      doHostLog(['doThrow', callIndex, hostReason]);
      unnestInterpreter(callIndex);
      const guestReason = hostToGuest(hostReason);
      throw guestReason;
    },

    // /////////////////////////////////////////////////////////////////////////

    checkFulfill(guestPromise, guestFulfillment) {
      const hostPromise = guestToHost(guestPromise);
      const hostFulfillment = guestToHost(guestFulfillment);
      checkHostLog(['checkFulfill', hostPromise, hostFulfillment]);
      promiseMap.get(hostPromise).hostResolve(hostFulfillment);
      promiseMap.delete(hostPromise);
    },

    checkReject(guestPromise, guestReason) {
      const hostPromise = guestToHost(guestPromise);
      const hostReason = guestToHost(guestReason);
      checkHostLog(['checkReject', hostPromise, hostReason]);
      promiseMap.get(hostPromise).hostReject(hostReason);
      promiseMap.delete(hostPromise);
    },

    doCall(hostCap, optVerb, hostArgs, callIndex) {
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
        throw dispatch.checkThrow(callIndex, guestReason);
      }
      return dispatch.checkReturn(callIndex, guestResult);
    },

    checkReturn(callIndex, guestResult) {
      const hostResult = hostToGuest(guestResult);
      checkHostLog(['checkReturn', callIndex, hostResult]);
      return hostResult;
    },

    checkThrow(callIndex, guestReason) {
      const hostReason = hostToGuest(guestReason);
      checkHostLog(['checkThrow', callIndex, hostReason]);
      throw hostReason;
    },
  });

  const interpretEntry = ([verb, ...args]) => {
    ['doCall', 'doReturn', 'doThrow', 'doFulfill', 'doReject'].includes(verb) ||
      Fail`internal: Unexpected verb: ${q(verb)} at ${q(hostLogIndex)}`;
    return dispatch[verb](...args);
  };

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
            hostFulfillment => dispatch.doFulfill(hostCap, hostFulfillment),
            hostReason => dispatch.doReject(hostCap, hostReason),
          );
        }
        break;
      }
      case 'remotable': {
        /** @param {PropertyKey} [optVerb] */
        const makeGuestMethod = (optVerb = undefined) => {
          const guestMethod = (...guestArgs) => {
            const callIndex = hostLogIndex;
            return dispatch.checkCall(guestCap, optVerb, guestArgs, callIndex);
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
        Fail`internal: Unrecognized passStyle ${passStyle}`;
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
          guestFulfillment => dispatch.checkFulfill(guestCap, guestFulfillment),
          guestReason => dispatch.checkReject(guestCap, guestReason),
        );
        break;
      }
      case 'remotable': {
        /** @param {PropertyKey} [optVerb] */
        const makeHostMethod = (optVerb = undefined) => {
          const hostMethod = (...hostArgs) => {
            const callIndex = hostLogIndex;
            return dispatch.doCall(hostCap, optVerb, hostArgs, callIndex);
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
        Fail`internal: Unrecognized passStyle ${passStyle}`;
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
      Fail`First log entry be a "doCall", not ${q(firstVerb)}`;
    const hostTarget = firstArg;
    memoG2H.set(guestTarget, hostTarget);
    memoH2G.set(hostTarget, guestTarget);
  }

  nestInterpreter(-1);

  return harden({
    hostProxy: guestToHost(guestTarget),
  });
};
harden(makeReplayMembraneKit);
