import Nat from '@agoric/nat';

// Deep stack debugging

// This module is used for diagnostic purposes, and keeps a bunch of
// mutable top-level state in violation of normal best
// practices. Because this state is used *only* for diagnostic
// purposes, we indulge. Ideally, we should support a special
// write-only diagnostics category of rule-violating code just as we
// do for test code. The key is that unprivileged clients cannot
// communicate with each other via such APIs. They can only
// communicate to those with special ability to read this diagnostic
// channel. "console" already fits these constraints and should be
// codified as precedent.

// If 0, calling this module's exports should be essentially
// free. Otherwise, calling these exports will silently do internal
// bookkeeping until logReceive catches an error. At that point, it
// will also emit deep stacks to console.log.
//
// Because we accumulate both send records and receive records, this
// should be approximately twice the number of shallow stacks needed.
let deepStackDepth = Infinity;

// TODO BUG This should only be settable from test or privileged code
export function setDeepStackDepth(depth) {
  if (depth !== Infinity) {
    depth = Nat(depth);
  }
  deepStackDepth = depth;
}

// A sendKey in flight is one logged by a logSend but not yet by a
// logReceive. This maps from sendKeys in flight to a deep stack, i.e., a
// linked list of single-turn stack records.
const stacksInFlight = new Map();

// This is a global mutable variable whose value is set only during
// the call to the thunk in logReceive. This is a form of dynamic or
// fluid scoping, and is normally a bad practice.
let currentStack;

export function dumpStacksInFlight() {
  // This enumeration is the reason we use a Map rather than a WeakMap
  for (const stack of stacksInFlight.values()) {
    console.log('DEEP STACK: ', stack);
  }
}

export function dumpCurrentStack() {
  console.log('CURRENT DEEP STACK: ', currentStack);
}

// More mutable globals.
let turnCount = 0;
let sendInTurnCount = 0;

// Call at the point where this turn causes another turn. Returns the
// sendKey to pass to through to the corresponding logReceive.
export function logSend(payload) {
  if (deepStackDepth === 0) {
    // TODO BUG Returning undefined leaks that deepStack is zero.
    return undefined;
  }
  sendInTurnCount += 1;
  // TODO BUG Should be unique but not leak info
  const sendKey = `${turnCount}:${sendInTurnCount}`;

  const stackHolder = new Error(
    `Just bookkeeping. Nothing bad happened here ${sendKey}`,
  );
  const depth = currentStack ? currentStack.depth + 1 : 1;
  const newStack = {
    priorStack: currentStack,
    stackHolder,
    kind: 'send',
    depth,
    turnCount,
    sendInTurnCount,
    payload,
  };
  stacksInFlight.set(sendKey, newStack);
  return sendKey;
}

// Call at the top of a turn that was caused by a previously logged
// send. Pass the sendKey returned by that previous logSend. Pass a
// thunk to be invoked as the turn. It is only execution during this
// thunk that will be associated with this sendKey.
export function logReceive(sendKey, payload, thunk) {
  if (deepStackDepth === 0) {
    return thunk();
  }
  if (currentStack !== undefined) {
    throw new Error(
      `logReceive calls must not nest: ${currentStack.sendKey} vs ${sendKey}`,
    );
  }
  turnCount += 1;
  sendInTurnCount = 0;
  let priorStack = undefined;
  if (sendKey === undefined) {
    console.error(`Missing sendKey at ${turnCount}`);
  } else {
    priorStack = stacksInFlight.get(sendKey);
    if (!priorStack) {
      throw new Error(
        `Received sendKey was never sent: ${JSON.stringify(sendKey)}`,
      );
    }
  }
  stacksInFlight.delete(sendKey);
  const depth = priorStack ? priorStack.depth + 1 : 1;
  currentStack = {
    priorStack,
    kind: 'receive',
    depth,
    turnCount,
    payload,
  };

  // This depth cutoff is the only reason we can't harden stacks
  if (depth > deepStackDepth) {
    const cutoff = depth - deepStackDepth;
    for (let s = currentStack; s; s = s.priorStack) {
      if (s.depth <= cutoff) {
        s.priorStack = undefined;
        break;
      }
    }
  }

  try {
    return thunk();
  } catch (err) {
    const errStack = {
      priorStack: currentStack,
      stackHolder: err,
      kind: 'error',
      depth: currentStack + 1,
      turnCount,
      sendInTurnCount,
    };
    console.log('DEEP STACK: ', errStack);
    throw err;
  } finally {
    currentStack = undefined;
  }
}
