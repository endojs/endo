// @ts-check

import {
  Promise,
  TypeError,
  defineProperties,
  objectHasOwnProperty,
  freeze,
  promisePrototype,
  getPrototypeOf,
  setPrototypeOf,
  construct,
} from './commons.js';

const originalThen = promisePrototype.then;

export const tamePromise = (promiseTaming = 'safe') => {
  if (promiseTaming !== 'safe' && promiseTaming !== 'unsafe') {
    throw new TypeError(`unrecognized promiseTaming ${promiseTaming}`);
  }
  if (promiseTaming === 'unsafe') {
    return;
  }

  function FakePromiseConstructor(...args) {
    return construct(Promise, args, Promise);
  }
  defineProperties(FakePromiseConstructor, {
    prototype: {
      value: promisePrototype,
    },
  });
  setPrototypeOf(FakePromiseConstructor, Promise);
  freeze(FakePromiseConstructor);

  // At this point, enable-property-overrides may or may not have
  // make `Promise.prototype.constructor` into an accessor. If it is
  // a data property, we need to turn it into an accessor with the following
  // getter and an `undefined` setter, so that after freezing it will
  // have the same override mistake problem that the data property would
  // have.
  // If it is already an accessor property, we need to replace the getter with
  // the following getter, but leave the setter that was presumably
  // installed by enable-property-overrides.
  const constructorDescDelta = {
    get() {
      freeze(this);
      if (
        getPrototypeOf(this) === promisePrototype &&
        !objectHasOwnProperty(this, 'then') &&
        this.then === originalThen
      ) {
        return Promise;
      }
      return FakePromiseConstructor;
    },
  };
  defineProperties(constructorDescDelta.get, {
    originalValue: {
      value: Promise,
      writable: false,
      enumerable: false,
      configurable: false,
    },
  });

  defineProperties(promisePrototype, {
    constructor: constructorDescDelta,
  });
};
