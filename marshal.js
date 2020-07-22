/* global harden */
// @ts-check

import Nat from '@agoric/nat';
import { isPromise } from '@agoric/produce-promise';

// TODO: Use just 'remote' when we're willing to make a breaking change.
const REMOTE_STYLE = 'presence';

// TODO, remove the mustPassByPresence alias when we make a breaking change.
// eslint-disable-next-line no-use-before-define
export { mustPassByRemote as mustPassByPresence };

/**
 * This is an interface specification.
 * For now, it is just a string, but will eventually become something
 * much richer (anything that pureCopy accepts).
 * @typedef {string} InterfaceSpec
 */

/**
 * @type {WeakMap<Object, InterfaceSpec>}
 */
const remotableToInterface = new WeakMap();

/**
 * Simple semantics, just tell what interface (or undefined) a remotable has.
 *
 * @param {*} maybeRemotable the value to check
 * @returns {InterfaceSpec | undefined} the interface specification, or undefined if not a Remotable
 */
export function getInterfaceOf(maybeRemotable) {
  return remotableToInterface.get(maybeRemotable);
}

/**
 * Do a deep copy of the object, handling Proxies and recursion.
 * The resulting copy is guaranteed to be pure data, as well as hardened.
 * Such a hardened, pure copy cannot be used as a communications path.
 *
 * @template T
 * @param {T} val input value.  NOTE: Must be hardened!
 * @returns {T} pure, hardened copy
 */
function pureCopy(val, already = new WeakMap()) {
  // eslint-disable-next-line no-use-before-define
  const passStyle = passStyleOf(val);
  switch (passStyle) {
    case 'bigint':
    case 'boolean':
    case 'null':
    case 'number':
    case 'string':
    case 'undefined':
      return val;

    case 'copyArray':
    case 'copyRecord': {
      const obj = /** @type {Object} */ (val);
      if (already.has(obj)) {
        return already.get(obj);
      }

      // Create a new identity.
      const copy = /** @type {T} */ (passStyle === 'copyArray' ? [] : {});

      // Prevent recursion.
      already.set(obj, copy);

      // Make a deep copy on the new identity.
      // Object.entries(obj) takes a snapshot (even if a Proxy).
      Object.entries(obj).forEach(([prop, value]) => {
        copy[prop] = pureCopy(value, already);
      });
      return harden(copy);
    }

    case 'copyError': {
      const unk = /** @type {unknown} */ (val);
      const err = /** @type {Error} */ (unk);

      if (already.has(err)) {
        return already.get(err);
      }

      const { name, message } = err;

      // eslint-disable-next-line no-use-before-define
      const EC = getErrorConstructor(`${name}`) || Error;
      const copy = harden(new EC(`${message}`));
      already.set(err, copy);

      const unk2 = /** @type {unknown} */ (harden(copy));
      return /** @type {T} */ (unk2);
    }

    case REMOTE_STYLE: {
      throw TypeError(
        `Input value ${passStyle} cannot be copied as must be passed by reference`,
      );
    }

    default:
      throw TypeError(`Input value ${passStyle} is not recognized as data`);
  }
}
harden(pureCopy);
export { pureCopy };

// Special property name that indicates an encoding that needs special
// decoding.
const QCLASS = '@qclass';
export { QCLASS };

// objects can only be passed in one of two/three forms:
// 1: pass-by-remote: all properties (own and inherited) are methods,
//    the object itself is of type object, not function
// 2: pass-by-copy: all string-named own properties are data, not methods
//    the object must inherit from Object.prototype or null
// 3: the empty object is pass-by-remote, for identity comparison

// all objects must be frozen

// anything else will throw an error if you try to serialize it

// with these restrictions, our remote call/copy protocols expose all useful
// behavior of these objects: pass-by-remote objects have no other data (so
// there's nothing else to copy), and pass-by-copy objects have no other
// behavior (so there's nothing else to invoke)

const errorConstructors = new Map([
  ['Error', Error],
  ['EvalError', EvalError],
  ['RangeError', RangeError],
  ['ReferenceError', ReferenceError],
  ['SyntaxError', SyntaxError],
  ['TypeError', TypeError],
  ['URIError', URIError],
]);

export function getErrorConstructor(name) {
  return errorConstructors.get(name);
}

function isPassByCopyError(val) {
  // TODO: Need a better test than instanceof
  if (!(val instanceof Error)) {
    return false;
  }
  const proto = Object.getPrototypeOf(val);
  const { name } = val;
  const EC = getErrorConstructor(name);
  if (!EC || EC.prototype !== proto) {
    throw TypeError(`Must inherit from an error class .prototype ${val}`);
  }

  const {
    message: { value: messageStr } = { value: '' },
    // Allow but ignore only extraneous own `stack` property.
    // TODO: I began the variable below with "_". Why do I still need
    // to suppress the lint complaint?
    // eslint-disable-next-line no-unused-vars
    stack: _optStackDesc,
    ...restDescs
  } = Object.getOwnPropertyDescriptors(val);
  const restNames = Object.keys(restDescs);
  if (restNames.length >= 1) {
    throw new TypeError(`Unexpected own properties in error: ${restNames}`);
  }
  if (typeof messageStr !== 'string') {
    throw new TypeError(`malformed error object: ${val}`);
  }
  return true;
}

function isPassByCopyArray(val) {
  if (!Array.isArray(val)) {
    return false;
  }
  if (Object.getPrototypeOf(val) !== Array.prototype) {
    throw new TypeError(`malformed array: ${val}`);
  }
  const len = val.length;
  const descs = Object.getOwnPropertyDescriptors(val);
  for (let i = 0; i < len; i += 1) {
    const desc = descs[i];
    if (!desc) {
      throw new TypeError(`arrays must not contain holes`);
    }
    if (!('value' in desc)) {
      throw new TypeError(`arrays must not contain accessors`);
    }
    if (typeof desc.value === 'function') {
      throw new TypeError(`arrays must not contain methods`);
    }
  }
  if (Object.keys(descs).length !== len + 1) {
    throw new TypeError(`array must not have non-indexes ${val}`);
  }
  return true;
}

function isPassByCopyRecord(val) {
  if (Object.getPrototypeOf(val) !== Object.prototype) {
    return false;
  }
  const descList = Object.values(Object.getOwnPropertyDescriptors(val));
  if (descList.length === 0) {
    // empty non-array objects are pass-by-remote, not pass-by-copy
    return false;
  }
  for (const desc of descList) {
    if (!('value' in desc)) {
      // Should we error if we see an accessor here?
      return false;
    }
    if (typeof desc.value === 'function') {
      return false;
    }
  }
  return true;
}

/**
 * Ensure that val could become a legitimate remotable.  This is used internally both
 * in the construction of a new remotable and mustPassByRemote.
 *
 * @param {*} val The remotable candidate to check
 */
function assertCanBeRemotable(val) {
  // throws exception if cannot
  if (typeof val !== 'object') {
    throw new Error(`cannot serialize non-objects like ${val}`);
  }
  if (Array.isArray(val)) {
    throw new Error(`Arrays cannot be pass-by-remote`);
  }
  if (val === null) {
    throw new Error(`null cannot be pass-by-remote`);
  }

  const names = Object.getOwnPropertyNames(val);
  names.forEach(name => {
    if (typeof val[name] !== 'function') {
      throw new Error(
        `cannot serialize objects with non-methods like the .${name} in ${val}`,
      );
      // return false;
    }
  });

  // ok!
}

export function mustPassByRemote(val) {
  if (!Object.isFrozen(val)) {
    throw new Error(`cannot serialize non-frozen objects like ${val}`);
  }

  if (getInterfaceOf(val) === undefined) {
    // Not a registered Remotable, so check its contents.
    assertCanBeRemotable(val);
  }

  // It's not a registered Remotable, so enforce the prototype check.
  const p = Object.getPrototypeOf(val);
  if (p !== null && p !== Object.prototype) {
    mustPassByRemote(p);
  }
}

// This is the equality comparison used by JavaScript's Map and Set
// abstractions, where NaN is the same as NaN and -0 is the same as
// 0. Marshal serializes -0 as zero, so the semantics of our distributed
// object system does not distinguish 0 from -0.
//
// `sameValueZero` is the EcmaScript spec name for this equality comparison,
// but TODO we need a better name for the API.
export function sameValueZero(x, y) {
  return x === y || Object.is(x, y);
}

// How would val be passed?  For primitive values, the answer is
//   * 'null' for null
//   * throwing an error for a symbol, whether registered or not.
//   * that value's typeof string for all other primitive values
// For frozen objects, the possible answers
//   * 'copyRecord' for non-empty records with only data properties
//   * 'copyArray' for arrays with only data properties
//   * 'copyError' for instances of Error with only data properties
//   * REMOTE_STYLE for non-array objects with only method properties
//   * 'promise' for genuine promises only
//   * throwing an error on anything else, including thenables.
// We export passStyleOf so other algorithms can use this module's
// classification.
export function passStyleOf(val) {
  const typestr = typeof val;
  switch (typestr) {
    case 'object': {
      if (getInterfaceOf(val)) {
        return REMOTE_STYLE;
      }
      if (val === null) {
        return 'null';
      }
      if (QCLASS in val) {
        // TODO Hilbert hotel
        throw new Error(`property "${QCLASS}" reserved`);
      }
      if (!Object.isFrozen(val)) {
        throw new Error(
          `Cannot pass non-frozen objects like ${val}. Use harden()`,
        );
      }
      if (isPromise(val)) {
        return 'promise';
      }
      if (typeof val.then === 'function') {
        throw new Error(`Cannot pass non-promise thenables`);
      }
      if (isPassByCopyError(val)) {
        return 'copyError';
      }
      if (isPassByCopyArray(val)) {
        return 'copyArray';
      }
      if (isPassByCopyRecord(val)) {
        return 'copyRecord';
      }
      mustPassByRemote(val);
      return REMOTE_STYLE;
    }
    case 'function': {
      throw new Error(`Bare functions like ${val} are disabled for now`);
    }
    case 'undefined':
    case 'string':
    case 'boolean':
    case 'number':
    case 'bigint': {
      return typestr;
    }
    case 'symbol': {
      throw new TypeError('Cannot pass symbols');
    }
    default: {
      throw new TypeError(`Unrecognized typeof ${typestr}`);
    }
  }
}

// The ibid logic relies on
//    * JSON.stringify on an array visiting array indexes from 0 to
//      arr.length -1 in order, and not visiting anything else.
//    * JSON.parse of a record (a plain object) creating an object on
//      which a getOwnPropertyNames will enumerate properties in the
//      same order in which they appeared in the parsed JSON string.

function makeReplacerIbidTable() {
  const ibidMap = new Map();
  let ibidCount = 0;

  return harden({
    has(obj) {
      return ibidMap.has(obj);
    },
    get(obj) {
      return ibidMap.get(obj);
    },
    add(obj) {
      ibidMap.set(obj, ibidCount);
      ibidCount += 1;
    },
  });
}

function makeReviverIbidTable(cyclePolicy) {
  const ibids = [];
  const unfinishedIbids = new WeakSet();

  return harden({
    get(allegedIndex) {
      const index = Nat(allegedIndex);
      if (index >= ibids.length) {
        throw new RangeError(`ibid out of range: ${index}`);
      }
      const result = ibids[index];
      if (unfinishedIbids.has(result)) {
        switch (cyclePolicy) {
          case 'allowCycles': {
            break;
          }
          case 'warnOfCycles': {
            console.log(`Warning: ibid cycle at ${index}`);
            break;
          }
          case 'forbidCycles': {
            throw new TypeError(`Ibid cycle at ${index}`);
          }
          default: {
            throw new TypeError(`Unrecognized cycle policy: ${cyclePolicy}`);
          }
        }
      }
      return result;
    },
    register(obj) {
      ibids.push(obj);
      return obj;
    },
    start(obj) {
      ibids.push(obj);
      unfinishedIbids.add(obj);
      return obj;
    },
    finish(obj) {
      unfinishedIbids.delete(obj);
      return obj;
    },
  });
}

const identityFn = x => x;

export function makeMarshal(
  convertValToSlot = identityFn,
  convertSlotToVal = identityFn,
) {
  function serializeSlot(val, slots, slotMap) {
    let slotIndex;
    if (slotMap.has(val)) {
      slotIndex = slotMap.get(val);
    } else {
      const slot = convertValToSlot(val);

      slotIndex = slots.length;
      slots.push(slot);
      slotMap.set(val, slotIndex);
    }

    return harden({
      [QCLASS]: 'slot',
      index: slotIndex,
    });
  }

  function makeReplacer(slots, slotMap) {
    const ibidTable = makeReplacerIbidTable();

    return function replacer(_, val) {
      // First we handle all primitives. Some can be represented directly as
      // JSON, and some must be encoded as [QCLASS] composites.
      const passStyle = passStyleOf(val);
      switch (passStyle) {
        case 'null': {
          return null;
        }
        case 'undefined': {
          return harden({ [QCLASS]: 'undefined' });
        }
        case 'string':
        case 'boolean': {
          return val;
        }
        case 'number': {
          if (Number.isNaN(val)) {
            return harden({ [QCLASS]: 'NaN' });
          }
          if (Object.is(val, -0)) {
            return 0;
          }
          if (val === Infinity) {
            return harden({ [QCLASS]: 'Infinity' });
          }
          if (val === -Infinity) {
            return harden({ [QCLASS]: '-Infinity' });
          }
          return val;
        }
        case 'bigint': {
          return harden({
            [QCLASS]: 'bigint',
            digits: String(val),
          });
        }
        default: {
          // if we've seen this object before, serialize a backref
          if (ibidTable.has(val)) {
            // Backreference to prior occurrence
            return harden({
              [QCLASS]: 'ibid',
              index: ibidTable.get(val),
            });
          }
          ibidTable.add(val);

          switch (passStyle) {
            case 'copyRecord':
            case 'copyArray': {
              // console.log(`canPassByCopy: ${val}`);
              // Purposely in-band for readability, but creates need for
              // Hilbert hotel.
              return val;
            }
            case 'copyError': {
              // We deliberately do not share the stack, but it would
              // be useful to log the stack locally so someone who has
              // privileged access to the throwing Vat can correlate
              // the problem with the remote Vat that gets this
              // summary. If we do that, we could allocate some random
              // identifier and include it in the message, to help
              // with the correlation.
              return harden({
                [QCLASS]: 'error',
                name: `${val.name}`,
                message: `${val.message}`,
              });
            }
            case REMOTE_STYLE:
            case 'promise': {
              // console.log(`serializeSlot: ${val}`);
              return serializeSlot(val, slots, slotMap);
            }
            default: {
              throw new TypeError(`unrecognized passStyle ${passStyle}`);
            }
          }
        }
      }
    };
  }

  // val might be a primitive, a pass by (shallow) copy object, a
  // remote reference, or other.  We treat all other as a local object
  // to be exported as a local webkey.
  function serialize(val) {
    const slots = [];
    const slotMap = new Map(); // maps val (promise or remotable) to
    // index of slots[]
    return harden({
      body: JSON.stringify(val, makeReplacer(slots, slotMap)),
      slots,
    });
  }

  function makeFullRevive(slots, cyclePolicy) {
    // ibid table is shared across recursive calls to fullRevive.
    const ibidTable = makeReviverIbidTable(cyclePolicy);

    // We stay close to the algorith at
    // https://tc39.github.io/ecma262/#sec-json.parse , where
    // fullRevive(JSON.parse(str)) is like JSON.parse(str, revive))
    // for a similar reviver. But with the following differences:
    //
    // Rather than pass a reviver to JSON.parse, we first call a plain
    // (one argument) JSON.parse to get rawTree, and then post-process
    // the rawTree with fullRevive. The kind of revive function
    // handled by JSON.parse only does one step in post-order, with
    // JSON.parse doing the recursion. By contrast, fullParse does its
    // own recursion, enabling it to interpret ibids in the same
    // pre-order in which the replacer visited them, and enabling it
    // to break cycles.
    //
    // In order to break cycles, the potentially cyclic objects are
    // not frozen during the recursion. Rather, the whole graph is
    // hardened before being returned. Error objects are not
    // potentially recursive, and so may be harmlessly hardened when
    // they are produced.
    //
    // fullRevive can produce properties whose value is undefined,
    // which a JSON.parse on a reviver cannot do. If a reviver returns
    // undefined to JSON.parse, JSON.parse will delete the property
    // instead.
    //
    // fullRevive creates and returns a new graph, rather than
    // modifying the original tree in place.
    //
    // fullRevive may rely on rawTree being the result of a plain call
    // to JSON.parse. However, it *cannot* rely on it having been
    // produced by JSON.stringify on the replacer above, i.e., it
    // cannot rely on it being a valid marshalled
    // representation. Rather, fullRevive must validate that.
    return function fullRevive(rawTree) {
      if (Object(rawTree) !== rawTree) {
        // primitives pass through
        return rawTree;
      }
      if (QCLASS in rawTree) {
        const qclass = rawTree[QCLASS];
        if (typeof qclass !== 'string') {
          throw new TypeError(`invalid qclass typeof ${typeof qclass}`);
        }
        switch (qclass) {
          // Encoding of primitives not handled by JSON
          case 'undefined': {
            return undefined;
          }
          case 'NaN': {
            return NaN;
          }
          case 'Infinity': {
            return Infinity;
          }
          case '-Infinity': {
            return -Infinity;
          }
          case 'bigint': {
            if (typeof rawTree.digits !== 'string') {
              throw new TypeError(
                `invalid digits typeof ${typeof rawTree.digits}`,
              );
            }
            /* eslint-disable-next-line no-undef */
            return BigInt(rawTree.digits);
          }

          case 'ibid': {
            return ibidTable.get(rawTree.index);
          }

          case 'error': {
            if (typeof rawTree.name !== 'string') {
              throw new TypeError(
                `invalid error name typeof ${typeof rawTree.name}`,
              );
            }
            if (typeof rawTree.message !== 'string') {
              throw new TypeError(
                `invalid error message typeof ${typeof rawTree.message}`,
              );
            }
            const EC = getErrorConstructor(`${rawTree.name}`) || Error;
            return ibidTable.register(harden(new EC(`${rawTree.message}`)));
          }

          case 'slot': {
            const slot = slots[Nat(rawTree.index)];
            return ibidTable.register(convertSlotToVal(slot));
          }

          default: {
            // TODO reverse Hilbert hotel
            throw new TypeError(`unrecognized ${QCLASS} ${qclass}`);
          }
        }
      } else if (Array.isArray(rawTree)) {
        const result = ibidTable.start([]);
        const len = rawTree.length;
        for (let i = 0; i < len; i += 1) {
          result[i] = fullRevive(rawTree[i]);
        }
        return ibidTable.finish(result);
      } else {
        const result = ibidTable.start({});
        const names = Object.getOwnPropertyNames(rawTree);
        for (const name of names) {
          result[name] = fullRevive(rawTree[name]);
        }
        return ibidTable.finish(result);
      }
    };
  }

  function unserialize(data, cyclePolicy = 'forbidCycles') {
    if (data.body !== `${data.body}`) {
      throw new Error(
        `unserialize() given non-capdata (.body is ${data.body}, not string)`,
      );
    }
    if (!Array.isArray(data.slots)) {
      throw new Error(`unserialize() given non-capdata (.slots are not Array)`);
    }
    const rawTree = harden(JSON.parse(data.body));
    const fullRevive = makeFullRevive(data.slots, cyclePolicy);
    return harden(fullRevive(rawTree));
  }

  return harden({
    serialize,
    unserialize,
  });
}

/**
 * Create and register a Remotable.  After this, getInterfaceOf(remotable)
 * returns iface.
 *
 * // https://github.com/Agoric/agoric-sdk/issues/804
 *
 * @param {InterfaceSpec} [iface='Remotable'] The interface specification for the remotable
 * @param {object} [props={}] Own-properties are copied to the remotable
 * @param {object} [remotable={}] The object used as the remotable
 * @returns {object} remotable, modified for debuggability
 */
function Remotable(iface = 'Remotable', props = {}, remotable = {}) {
  iface = pureCopy(harden(iface));
  const ifaceType = typeof iface;

  // Find the alleged name.
  if (ifaceType !== 'string') {
    throw Error(`Interface must be a string, not ${ifaceType}; unimplemented`);
  }

  // TODO: When iface is richer than just string, we need to get the allegedName
  // in a different way.
  const allegedName = iface;

  // Fail fast: check that the unmodified object is able to become a Remotable.
  assertCanBeRemotable(remotable);

  // Ensure that the remotable isn't already registered.
  if (remotableToInterface.has(remotable)) {
    throw Error(`Remotable ${remotable} is already mapped to an interface`);
  }

  // A prototype for debuggability.
  const oldRemotableProto = harden(Object.getPrototypeOf(remotable));

  // Fail fast: create a fresh empty object with the old
  // prototype in order to check it against our rules.
  mustPassByRemote(harden(Object.create(oldRemotableProto)));

  // Assign the arrow function to a variable to set its .name.
  const toString = () => `[${allegedName}]`;
  const remotableProto = harden(
    Object.create(oldRemotableProto, {
      toString: {
        value: toString,
        enumerable: false,
      },
      [Symbol.toStringTag]: {
        value: allegedName,
        enumerable: false,
      },
    }),
  );

  // Take a static copy of the properties.
  const propEntries = Object.entries(props);
  const mutateHardenAndCheck = target => {
    // Add the snapshotted properties.
    /** @type {PropertyDescriptorMap} */
    const newProps = {};
    propEntries.forEach(([prop, value]) => (newProps[prop] = { value }));
    Object.defineProperties(target, newProps);

    // Set the prototype for debuggability.
    Object.setPrototypeOf(target, remotableProto);
    harden(remotableProto);

    harden(target);
    assertCanBeRemotable(target);
    return target;
  };

  // Fail fast: check a fresh remotable to see if our rules fit.
  const throwawayRemotable = Object.create(oldRemotableProto);
  mutateHardenAndCheck(throwawayRemotable);

  // Actually finish the new remotable.
  mutateHardenAndCheck(remotable);

  // COMMITTED!
  // We're committed, so keep the interface for future reference.
  remotableToInterface.set(remotable, iface);
  return remotable;
}

harden(Remotable);
export { Remotable };
