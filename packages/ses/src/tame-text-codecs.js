// @ts-check

import { defineProperty, globalThis, isPrimitive } from './commons.js';
import { encapsulateHostConstructor } from './encapsulate-host-constructor.js';

/**
 * Replace one host text codec constructor, if present, with a SES-owned
 * constructor that delegates construction to the captured host original and
 * shares the host prototype.
 *
 * @param {'TextEncoder' | 'TextDecoder'} name
 */
const tameTextCodec = name => {
  const HostCodec = globalThis[name];
  if (typeof HostCodec !== 'function') {
    // Absent on this host (for example XS, unless the engine shell provides
    // the codecs). The permits already tolerate the absence.
    return;
  }
  if (isPrimitive(HostCodec.prototype)) {
    // Not a plausible codec constructor. Leave it for the permits
    // enforcement pass to remove or reject.
    return;
  }

  const SharedCodec = encapsulateHostConstructor(HostCodec, name);

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
 * Replace host `TextEncoder` and `TextDecoder` constructors with
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
 * sidesteps the dilemma: the permitted intrinsic is a SES-owned constructor,
 * and the host constructor object, restricted properties and all, never enters
 * the permitted intrinsics graph. The replacement is unconditional so every
 * host exposes the same permitted shape.
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
