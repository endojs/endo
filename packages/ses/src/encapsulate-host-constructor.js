// @ts-check

import { TypeError, construct, defineProperties } from './commons.js';

/**
 * @typedef {(new (...argumentsList: any[]) => object) & { prototype: object, length: number }} HostConstructorShape
 */

/**
 * Make an SES-owned constructor that delegates to a host constructor while
 * sharing and repointing its prototype.
 * The result mirrors a WebIDL interface object
 * (https://webidl.spec.whatwg.org/#interface-object): calling it without `new`
 * throws, its `prototype` is non-writable and non-configurable, and the
 * prototype's `constructor` keeps its writable, configurable attributes.
 *
 * @param {HostConstructorShape} HostConstructor
 * @param {string} name
 * @returns {HostConstructorShape & ((...argumentsList: any[]) => never)}
 */
export const encapsulateHostConstructor = (HostConstructor, name) => {
  const hostPrototype = HostConstructor.prototype;

  const EncapsulatedConstructor =
    /** @type {HostConstructorShape & ((...argumentsList: any[]) => never)} */ (
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
  } catch (error) {
    throw TypeError(
      `Cannot tame ${name}: its prototype's constructor cannot be repointed; the prototype was frozen or locked before lockdown(), possibly by a second copy of SES`,
      { cause: error },
    );
  }

  return EncapsulatedConstructor;
};
