// @ts-check

import {
  TypeError,
  WeakSet,
  construct,
  defineProperties,
  defineProperty,
  globalThis,
  isPrimitive,
  weaksetAdd,
  weaksetHas,
} from './commons.js';

// The SES-owned replacement constructors already installed, so a second
// `tameTextCodecs()` call is a no-op rather than wrapping a replacement in
// another replacement. SES-for-XS tames at module load, before its shim
// compartment constructor samples the global intrinsics, and `lockdown()`
// tames again on every platform.
const replacements = new WeakSet();

/**
 * Replace one host text codec constructor, if present, with a SES-owned
 * constructor that delegates construction to the captured host original and
 * shares the host prototype.
 *
 * @param {'TextEncoder' | 'TextDecoder'} name
 */
const tameTextCodec = name => {
  const NativeCodec = globalThis[name];
  if (typeof NativeCodec !== 'function') {
    // Absent on this host (for example XS, unless the engine shell provides
    // the codecs). The permits already tolerate the absence.
    return;
  }
  if (weaksetHas(replacements, NativeCodec)) {
    // Already tamed.
    return;
  }
  const nativePrototype = NativeCodec.prototype;
  if (isPrimitive(nativePrototype)) {
    // Not a plausible codec constructor. Leave it for the permits
    // enforcement pass to remove or reject.
    return;
  }

  const SharedCodec = function TextCodec(...rest) {
    if (new.target === undefined) {
      throw TypeError(`Constructor ${name} requires 'new'`);
    }
    return construct(NativeCodec, rest, new.target);
  };

  defineProperties(SharedCodec, {
    name: { value: name },
    prototype: {
      value: nativePrototype,
      writable: false,
      enumerable: false,
      configurable: false,
    },
  });

  // Point the shared prototype's `constructor` back at the replacement, so
  // the host constructor object is unreachable from the permitted
  // intrinsics graph.
  defineProperties(nativePrototype, {
    constructor: { value: SharedCodec },
  });

  // Replace the global binding, so both the start compartment and the
  // intrinsics sampling pass observe only the replacement.
  defineProperty(globalThis, name, {
    value: SharedCodec,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  weaksetAdd(replacements, SharedCodec);
};

/**
 * Replace the host's `TextEncoder` and `TextDecoder` constructors, where
 * present, with SES-owned constructors that delegate construction to the
 * captured host originals and share the host prototypes.
 *
 * On Chromium before version 138, WebIDL constructors such as `TextEncoder`
 * and `TextDecoder` carry own legacy restricted properties — `caller` and
 * `arguments`, each `{ value: null, writable: false, configurable: false }` —
 * that lockdown can neither delete nor repair in place, so lockdown fails
 * (https://github.com/endojs/endo/issues/3369). That descriptor shape is
 * indistinguishable from the live `caller` and `arguments` slots of a sloppy
 * function, so neither tolerating nor permitting it is safe. Encapsulation
 * sidesteps the dilemma: the permitted `TextEncoder` and `TextDecoder`
 * intrinsics are SES-owned constructors on every engine, and the host
 * constructor objects, restricted properties and all, never enter the
 * permitted intrinsics graph.
 *
 * The host prototype objects carry no restricted properties, and all codec
 * behavior (methods, getters, brand checks) lives there, so the replacement
 * constructors reuse them. Instances made by the replacements are genuine
 * host codec instances with host internal slots, so `instanceof`,
 * subclassing (via `new.target`), `encode`, `encodeInto`, streaming
 * `decode`, decoder labels and options, and the `encoding`, `fatal`, and
 * `ignoreBOM` getters all retain host behavior.
 *
 * This must run before the intrinsics collector samples the universal
 * property names from the global object, so the sampled `TextEncoder` and
 * `TextDecoder` are the replacements.
 */
export const tameTextCodecs = () => {
  tameTextCodec('TextEncoder');
  tameTextCodec('TextDecoder');
};
