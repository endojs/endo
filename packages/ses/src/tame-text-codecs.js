// @ts-check

import {
  TypeError,
  construct,
  defineProperties,
  defineProperty,
  getOwnPropertyDescriptor,
  globalThis,
  isPrimitive,
} from './commons.js';

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
  if (getOwnPropertyDescriptor(NativeCodec, 'arguments') === undefined) {
    // This host constructor does not have the legacy restricted property that
    // prevents lockdown from removing or repairing it.
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
};

/**
 * Replace affected host `TextEncoder` and `TextDecoder` constructors with
 * SES-owned constructors that delegate construction to the captured host
 * originals and share the host prototypes.
 *
 * On Chromium before version 138, WebIDL constructors such as `TextEncoder`
 * and `TextDecoder` carry own legacy restricted properties — `caller` and
 * `arguments`, each `{ value: null, writable: false, configurable: false }` —
 * that lockdown can neither delete nor repair in place, so lockdown fails
 * (https://github.com/endojs/endo/issues/3369). That descriptor shape is
 * indistinguishable from the live `caller` and `arguments` slots of a sloppy
 * function, so neither tolerating nor permitting it is safe. Encapsulation
 * sidesteps the dilemma: when a host constructor has the affected
 * `arguments` descriptor, the permitted intrinsic is a SES-owned constructor,
 * and the host constructor object, restricted properties and all, never enters
 * the permitted intrinsics graph. Hosts without the affected descriptor retain
 * their original constructors.
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
