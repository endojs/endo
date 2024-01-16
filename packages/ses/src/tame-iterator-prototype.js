import {
  getPrototypeOf,
  iterateArray,
  objectHasOwnProperty,
  globalThis,
  TypeError,
  getOwnPropertyDescriptor,
  Symbol,
} from './commons.js';
import { enablePropertyOverride } from './enable-property-overrides.js';

/**
 *
 *
 */
export const tameIteratorPrototype = () => {
  // Repeat the portion of get-anonymous-intrinsics.js for discovering the
  // original `%IteratorPrototype%`

  const ArrayIteratorObject = iterateArray([]);
  const ArrayIteratorPrototype = getPrototypeOf(ArrayIteratorObject);
  const IteratorPrototype = getPrototypeOf(ArrayIteratorPrototype);

  // Are we in the world pre or post the iterators-helpers proposal?
  // https://tc39.es/proposal-iterator-helpers
  // It is already at stage three and shipping in Chrome Canary, so
  // we expect it to become part of standard JS soon.

  const desc = getOwnPropertyDescriptor(IteratorPrototype, 'constructor');
  if (desc === undefined) {
    // validate state expected before iterator-helpers proposal
    // eslint-disable-next-line no-lonely-if
    if ('Iterator' in globalThis) {
      throw TypeError(
        'If there is a global "Iterator", then "Iterator.prototype.constructor" must be an own property pointing at it.',
      );
    }
    return false;
  }

  // validate state expected with the iterators-helpers proposal
  const IntrinsicIterator = IteratorPrototype.constructor;
  const GlobalIterator = globalThis.Iterator;
  if (GlobalIterator) {
    if (GlobalIterator !== IntrinsicIterator) {
      throw TypeError('Iterarator must be %IteratorPrototype.constructor');
    }
    if (GlobalIterator.prototype !== IteratorPrototype) {
      throw TypeError('Iterator.prototype must be the %IteratorPrototype%');
    }
  } else if (IntrinsicIterator.prototype !== IteratorPrototype) {
    // Even though it deviates from the current proposal text,
    // tolerate `%Iterator%` being a hidden intrinsic, i.e.,
    // not on globalThis.
    throw TypeError('%Iterator%.prototype must be the %IteratorPrototype%');
  }

  // Allow IteratorPrototype.constructor to be a data property,
  // even though this is not currently conformant.
  if (objectHasOwnProperty(desc, 'value')) {
    assert(desc.value === IntrinsicIterator);
    return false;
  }

  // validate it as an accessor property
  assert(typeof desc.get === 'function');
  assert(typeof desc.set === 'function');
  const { get } = desc;
  assert(get() === IntrinsicIterator);
  // TODO in theory we should validate `set`'s behavior.

  // redo preparing it for property override, so we know what we're doing.
  enablePropertyOverride(
    'intrinsics.Iterator.prototype',
    IteratorPrototype,
    'constructor',
    {
      value: IntrinsicIterator,
      writable: true,
      enumerable: false,
      configurable: true, // so vetted shims can still change before harden
    },
  );

  enablePropertyOverride(
    'intrinsics.Iterator.prototype',
    IteratorPrototype,
    Symbol.toStringTag,
    {
      value: 'Iterator',
      writable: true,
      enumerable: false,
      configurable: true, // so vetted shims can still change before harden
    },
  );

  return true;
};
