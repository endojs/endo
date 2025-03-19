import {
  Proxy,
  String,
  TypeError,
  ReferenceError,
  create,
  freeze,
  getOwnPropertyDescriptors,
} from './commons.js';
import { assert } from './error/assert.js';

const { Fail, quote: q } = assert;

/**
 * `freeze` but not `harden` the proxy target so it remains trapping.
 * Thus, it should not be shared outside this module.
 *
 * @see https://github.com/endojs/endo/blob/master/packages/ses/docs/preparing-for-stabilize.md
 */
const objTarget = freeze({ __proto__: null });

/**
 * alwaysThrowHandler
 * This is an object that throws if any property is called. It's used as
 * a proxy handler which throws on any trap called.
 * It's made from a proxy with a get trap that throws. It's safe to
 * create one and share it between all Proxy handlers.
 */
export const alwaysThrowHandler = new Proxy(
  objTarget,
  freeze({
    get(_shadow, prop) {
      Fail`Please report unexpected scope handler trap: ${q(String(prop))}`;
    },
  }),
);

/*
 * scopeProxyHandlerProperties
 * scopeTerminatorHandler manages a strictScopeTerminator Proxy which serves as
 * the final scope boundary that will always return "undefined" in order
 * to prevent access to "start compartment globals".
 */
const scopeProxyHandlerProperties = {
  get(_shadow, _prop) {
    return undefined;
  },

  set(_shadow, prop, _value) {
    // We should only hit this if the has() hook returned true matches the v8
    // ReferenceError message "Uncaught ReferenceError: xyz is not defined"
    throw ReferenceError(`${String(prop)} is not defined`);
  },

  has(_shadow, prop) {
    // we must at least return true for all properties on the realm globalThis
    return true;
  },

  // note: this is likely a bug of safari
  // https://bugs.webkit.org/show_bug.cgi?id=195534
  getPrototypeOf(_shadow) {
    return null;
  },

  // See https://github.com/endojs/endo/issues/1510
  // TODO: report as bug to v8 or Chrome, and record issue link here.
  getOwnPropertyDescriptor(_shadow, prop) {
    // Coerce with `String` in case prop is a symbol.
    const quotedProp = q(String(prop));
    // eslint-disable-next-line @endo/no-polymorphic-call
    console.warn(
      `getOwnPropertyDescriptor trap on scopeTerminatorHandler for ${quotedProp}`,
      TypeError().stack,
    );
    return undefined;
  },

  // See https://github.com/endojs/endo/issues/1490
  // TODO Report bug to JSC or Safari
  ownKeys(_shadow) {
    return [];
  },
};

// The scope handler's prototype is a proxy that throws if any trap other
// than get/set/has are run (like getOwnPropertyDescriptors, apply,
// getPrototypeOf).
export const strictScopeTerminatorHandler = freeze(
  create(
    alwaysThrowHandler,
    getOwnPropertyDescriptors(scopeProxyHandlerProperties),
  ),
);

export const strictScopeTerminator = new Proxy(
  objTarget,
  strictScopeTerminatorHandler,
);
