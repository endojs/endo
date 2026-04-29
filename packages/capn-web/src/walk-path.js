/* eslint-disable no-await-in-loop -- the path walker is sequential by design */
// Walk a property path on a value (resolving promises at each step) and
// optionally invoke the result as a method/function with given arguments.
//
// Used by the push-handler to execute pipelined operations like
//   ["pipeline", id, ["foo", "bar"], [arg1, arg2]]
// which means: load the value at id, get .foo, get .bar, then call it with
// (arg1, arg2).
//
// Property reads and method invocations dispatch via `HandledPromise` so
// the same code works for:
//   - Far / makeExo locals (handler-dispatched but ultimately a direct call),
//   - presences from another session (handler-dispatched as a remote send,
//     which is what makes three-party capability forwarding work — when a
//     foreign stub flows through us as an export, calls on it forward back
//     through its origin session),
//   - plain functions and objects (HandledPromise falls back to direct
//     property access / function call).
//
// The walker rejects path segments that are prototype-affecting names
// (`__proto__`, `constructor`, `prototype`) so a malicious peer can't
// reach into our internals via path traversal.

import harden from '@endo/harden';
import { HandledPromise } from '@endo/eventual-send';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const checkSegment = seg => {
  if (typeof seg === 'string' && FORBIDDEN_KEYS.has(seg)) {
    throw new TypeError(`forbidden property name in path: ${seg}`);
  }
  return seg;
};

/**
 * @param {unknown} root
 * @param {readonly PropertyKey[]} path
 * @param {readonly unknown[] | undefined} args
 * @returns {Promise<unknown>}
 */
export const walkPathAndCall = async (root, path, args) => {
  for (const seg of path) checkSegment(seg);

  // Pure property descent: walk every segment via HandledPromise.get.
  if (args === undefined) {
    let cur = await root;
    for (const seg of path) {
      cur = await HandledPromise.get(cur, seg);
    }
    return cur;
  }

  // Function or method call.
  if (path.length === 0) {
    // Calling the root value itself as a function.
    const target = await root;
    if (typeof target === 'function') {
      return target(.../** @type {unknown[]} */ (args));
    }
    // If the target has a HandledPromise handler with applyFunction (e.g.
    // a function-stub from a peer), use it.
    return HandledPromise.applyFunction(
      target,
      /** @type {unknown[]} */ (args),
    );
  }

  // Method call: descend all but the last segment, then invoke the last as
  // a method.  Using HandledPromise.applyMethod on the receiver lets the
  // call forward through any handler in play (foreign stub → remote send).
  let cur = await root;
  for (const seg of path.slice(0, -1)) {
    cur = await HandledPromise.get(cur, seg);
  }
  const method = path[path.length - 1];
  return HandledPromise.applyMethod(
    cur,
    method,
    /** @type {unknown[]} */ (args),
  );
};

harden(walkPathAndCall);
