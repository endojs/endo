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
 * Replace host text codec constructors before the intrinsics collector samples
 * the global object. Chromium before version 138 gives these constructors
 * restricted `caller` and `arguments` properties that cannot be safely
 * permitted or repaired (https://github.com/endojs/endo/issues/3369).
 * Encapsulation keeps the host constructors outside the permitted graph while
 * sharing their prototypes and behavior.
 */
export const tameTextCodecs = () => {
  tameTextCodec('TextEncoder');
  tameTextCodec('TextDecoder');
};
