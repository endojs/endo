// @ts-check

import { TypeError, construct, defineProperties } from './commons.js';

/**
 * @typedef {object} HostConstructorProperties
 * @property {object} prototype
 * @property {number} length
 */

/**
 * @typedef {HostConstructorProperties & (new (...argumentsList: any[]) => object)} HostConstructor
 */

/**
 * @typedef {HostConstructor & ((...argumentsList: any[]) => never)} EncapsulatedHostConstructor
 */

/**
 * Make an SES-owned constructor that delegates to a host constructor while
 * sharing and repointing its prototype.
 *
 * @param {HostConstructor} HostConstructor
 * @param {string} name
 * @returns {EncapsulatedHostConstructor}
 */
export const encapsulateHostConstructor = (HostConstructor, name) => {
  const hostPrototype = HostConstructor.prototype;

  const EncapsulatedConstructor = /** @type {EncapsulatedHostConstructor} */ (
    function EncapsulatedConstructor(...argumentsList) {
      if (new.target === undefined) {
        throw TypeError(`Calling ${name} constructor as a function throws`);
      }
      return construct(HostConstructor, argumentsList, new.target);
    }
  );

  defineProperties(EncapsulatedConstructor, {
    length: { value: HostConstructor.length },
    name: { value: name },
    prototype: {
      value: hostPrototype,
      writable: false,
      enumerable: false,
      configurable: false,
    },
  });

  try {
    defineProperties(hostPrototype, {
      constructor: { value: EncapsulatedConstructor },
    });
  } catch (_error) {
    throw TypeError(
      `Cannot tame ${name}: its prototype's constructor cannot be repointed; the prototype was frozen or locked before lockdown(), possibly by a second copy of SES`,
    );
  }

  return EncapsulatedConstructor;
};
