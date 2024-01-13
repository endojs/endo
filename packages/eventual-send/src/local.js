import { makeMessageBreakpointTester } from './message-breakpoints.js';

const { details: X, quote: q, Fail } = assert;

const { getOwnPropertyDescriptors, getPrototypeOf, freeze } = Object;
const { apply, ownKeys } = Reflect;

const ntypeof = specimen => (specimen === null ? 'null' : typeof specimen);

const onDelivery = makeMessageBreakpointTester('ENDO_DELIVERY_BREAKPOINTS');

/**
 * TODO Consolidate with `isObject` that's currently in `@endo/marshal`
 *
 * @param {any} val
 * @returns {boolean}
 */
const isObject = val => Object(val) === val;

/**
 * Prioritize symbols as earlier than strings.
 *
 * @param {string|symbol} a
 * @param {string|symbol} b
 * @returns {-1 | 0 | 1}
 */
const compareStringified = (a, b) => {
  if (typeof a === typeof b) {
    const left = String(a);
    const right = String(b);
    // eslint-disable-next-line no-nested-ternary
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (typeof a === 'symbol') {
    assert(typeof b === 'string');
    return -1;
  }
  assert(typeof a === 'string');
  assert(typeof b === 'symbol');
  return 1;
};

/**
 * @param {any} val
 * @returns {(string|symbol)[]}
 */
export const getMethodNames = val => {
  let layer = val;
  const names = new Set(); // Set to deduplicate
  while (layer !== null && layer !== Object.prototype) {
    // be tolerant of non-objects
    const descs = getOwnPropertyDescriptors(layer);
    for (const name of ownKeys(descs)) {
      // In case a method is overridden by a non-method,
      // test `val[name]` rather than `layer[name]`
      if (typeof val[name] === 'function') {
        names.add(name);
      }
    }
    if (!isObject(val)) {
      break;
    }
    layer = getPrototypeOf(layer);
  }
  return harden([...names].sort(compareStringified));
};
// The top level of the eventual send modules can be evaluated before
// ses creates `harden`, and so cannot rely on `harden` at top level.
freeze(getMethodNames);

export const localApplyFunction = (recipient, args) => {
  typeof recipient === 'function' ||
    assert.fail(
      X`Cannot invoke target as a function; typeof target is ${q(
        ntypeof(recipient),
      )}`,
      TypeError,
    );
  if (onDelivery && onDelivery.shouldBreakpoint(recipient, undefined)) {
    // eslint-disable-next-line no-debugger
    debugger; // STEP INTO APPLY
    // Stopped at a breakpoint on this delivery of an eventual function call
    // so that you can step *into* the following `apply` in order to see the
    // function call as it happens. Or step *over* to see what happens
    // after the function call returns.
  }
  const result = apply(recipient, undefined, args);
  return result;
};

export const localApplyMethod = (recipient, methodName, args) => {
  if (methodName === undefined || methodName === null) {
    // Base case; bottom out to apply functions.
    return localApplyFunction(recipient, args);
  }
  if (recipient === undefined || recipient === null) {
    assert.fail(
      X`Cannot deliver ${q(methodName)} to target; typeof target is ${q(
        ntypeof(recipient),
      )}`,
      TypeError,
    );
  }
  const fn = recipient[methodName];
  if (fn === undefined) {
    assert.fail(
      X`target has no method ${q(methodName)}, has ${q(
        getMethodNames(recipient),
      )}`,
      TypeError,
    );
  }
  const ftype = ntypeof(fn);
  typeof fn === 'function' ||
    Fail`invoked method ${q(methodName)} is not a function; it is a ${q(
      ftype,
    )}`;
  if (onDelivery && onDelivery.shouldBreakpoint(recipient, methodName)) {
    // eslint-disable-next-line no-debugger
    debugger; // STEP INTO APPLY
    // Stopped at a breakpoint on this delivery of an eventual method call
    // so that you can step *into* the following `apply` in order to see the
    // method call as it happens. Or step *over* to see what happens
    // after the method call returns.
  }
  const result = apply(fn, recipient, args);
  return result;
};

export const localGet = (t, key) => t[key];
