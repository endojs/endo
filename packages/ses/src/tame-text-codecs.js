// @ts-check

import {
  defineProperty,
  getOwnPropertyDescriptor,
  globalThis,
  isPrimitive,
} from './commons.js';
import { encapsulateHostConstructor } from './encapsulate-host-constructor.js';

/**
 * Whether a host constructor carries an own, non-configurable `caller` or
 * `arguments` property, which the permits pass could neither delete nor
 * permit. Either member of the pair suffices; a configurable one is left for
 * the permits pass to delete.
 *
 * @param {object} HostCodec
 * @param {'caller' | 'arguments'} key
 */
const isRestrictedProperty = (HostCodec, key) => {
  const desc = getOwnPropertyDescriptor(HostCodec, key);
  return desc !== undefined && !desc.configurable;
};

/** @param {object} HostCodec */
const hasRestrictedProperty = HostCodec =>
  isRestrictedProperty(HostCodec, 'caller') ||
  isRestrictedProperty(HostCodec, 'arguments');

/**
 * Encapsulate one host text codec constructor if it has an affected own
 * `caller` or `arguments` property.
 *
 * @param {'TextEncoder' | 'TextDecoder'} name
 */
const tameTextCodec = name => {
  const HostCodec = globalThis[name];
  if (typeof HostCodec !== 'function') {
    // Absent on this host (for example Hermes, or XS unless the engine shell
    // provides the codecs). The permits already tolerate the absence.
    return;
  }
  if (!hasRestrictedProperty(HostCodec)) {
    // Unaffected host: lockdown can harden the original constructor.
    return;
  }
  if (isPrimitive(HostCodec.prototype)) {
    // Not a plausible codec constructor. Leave it for the permits
    // enforcement pass to remove or reject.
    return;
  }

  const EncapsulatedCodec = encapsulateHostConstructor(HostCodec, name);

  // Replace the global binding, so both the start compartment and the
  // intrinsics sampling pass observe only the replacement.
  defineProperty(globalThis, name, {
    value: EncapsulatedCodec,
    writable: true,
    enumerable: false,
    configurable: true,
  });
};

/**
 * Chromium before version 138 gives the text codec constructors restricted
 * `caller` and `arguments` properties that, as reported in
 * https://github.com/endojs/endo/issues/3369, lockdown can neither remove nor
 * safely permit.
 * Encapsulation keeps such a host constructor outside the permitted graph
 * while sharing its prototype and behavior.
 */
export const tameTextCodecs = () => {
  tameTextCodec('TextEncoder');
  tameTextCodec('TextDecoder');
};
