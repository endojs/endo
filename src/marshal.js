// @ts-check

// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import { Nat } from '@agoric/nat';
import { assert, details as X, q } from '@agoric/assert';
import { isPromise } from '@agoric/promise-kit';
import { makeReplacerIbidTable, makeReviverIbidTable } from './ibidTables';

import './types';

const {
  getPrototypeOf,
  setPrototypeOf,
  create,
  getOwnPropertyDescriptors,
  defineProperties,
  is,
  isFrozen,
  fromEntries,
  prototype: objectPrototype,
} = Object;

const { ownKeys } = Reflect;

// TODO: Use just 'remote' when we're willing to make a breaking change.
export const REMOTE_STYLE = 'presence';

const PASS_STYLE = Symbol.for('passStyle');

/** @type {MarshalGetInterfaceOf} */
export function getInterfaceOf(val) {
  if (typeof val !== 'object' || val === null) {
    return undefined;
  }
  if (val[PASS_STYLE] !== REMOTE_STYLE) {
    return undefined;
  }
  assert(isFrozen(val), X`Remotable ${val} must be frozen`, TypeError);
  const iface = val[Symbol.toStringTag];
  assert.typeof(
    iface,
    'string',
    X`Remotable interface currently can only be a string`,
  );
  return iface;
}

/**
 * Do a deep copy of the object, handling Proxies and recursion.
 * The resulting copy is guaranteed to be pure data, as well as hardened.
 * Such a hardened, pure copy cannot be used as a communications path.
 *
 * @template T
 * @param {T & OnlyData} val input value.  NOTE: Must be hardened!
 * @param {WeakMap<any,any>} [already=new WeakMap()]
 * @returns {T & PureData} pure, hardened copy
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
    case 'symbol':
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
      // Since we already know it is a copyRecord or copyArray, we
      // know that Object.entries is safe enough. On a copyRecord it
      // will represent all the own properties. On a copyArray it
      // will represent all the own properties except for the length.
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
      assert.fail(
        X`Input value ${q(
          passStyle,
        )} cannot be copied as it must be passed by reference`,
        TypeError,
      );
    }

    case 'promise': {
      assert.fail(X`Promises cannot be copied`, TypeError);
    }

    default:
      assert.fail(
        X`Input value ${q(passStyle)} is not recognized as data`,
        TypeError,
      );
  }
}
harden(pureCopy);
export { pureCopy };

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

/**
 * For most of these classification tests, we do strict validity `assert`s,
 * throwing if we detect something invalid. For errors, we need to remember
 * the error itself exists to help us diagnose a bug that's likely more
 * pressing than a validity bug in the error itself. Thus, whenever it is safe
 * to do so, we prefer to let the error test succeed and to couch these
 * complaints as notes on the error.
 *
 * @param {Passable} val
 * @returns {boolean}
 */
function isPassByCopyError(val) {
  // TODO: Need a better test than instanceof
  if (!(val instanceof Error)) {
    return false;
  }
  const proto = getPrototypeOf(val);
  const { name } = val;
  const EC = getErrorConstructor(name);
  if (!EC || EC.prototype !== proto) {
    assert.note(
      val,
      X`Errors must inherit from an error class .prototype ${val}`,
    );
  }

  const {
    message: mDesc,
    // Allow but ignore only extraneous own `stack` property.
    stack: _optStackDesc,
    ...restDescs
  } = getOwnPropertyDescriptors(val);
  if (ownKeys(restDescs).length >= 1) {
    assert.note(
      val,
      X`Passed Error has extra unpassed properties ${restDescs}`,
    );
  }
  if (mDesc) {
    if (typeof mDesc.value !== 'string') {
      assert.note(
        val,
        X`Passed Error "message" ${mDesc} must be a string-valued data property.`,
      );
    }
    if (mDesc.enumerable) {
      assert.note(
        val,
        X`Passed Error "message" ${mDesc} must not be enumerable`,
      );
    }
  }
  return true;
}

/**
 * @param {Passable} val
 * @returns {boolean}
 */
function isPassByCopyArray(val) {
  if (!Array.isArray(val)) {
    return false;
  }
  assert(
    getPrototypeOf(val) === Array.prototype,
    X`Malformed array: ${val}`,
    TypeError,
  );
  const len = val.length;
  const descs = getOwnPropertyDescriptors(val);
  for (let i = 0; i < len; i += 1) {
    const desc = descs[i];
    assert(desc, X`Arrays must not contain holes: ${q(i)}`, TypeError);
    assert(
      'value' in desc,
      X`Arrays must not contain accessors: ${q(i)}`,
      TypeError,
    );
    assert(
      typeof desc.value !== 'function',
      X`Arrays must not contain methods: ${q(i)}`,
      TypeError,
    );
    assert(
      desc.enumerable,
      X`Array elements must be enumerable: ${q(i)}`,
      TypeError,
    );
  }
  assert(
    ownKeys(descs).length === len + 1,
    X`Arrays must not have non-indexes: ${val}`,
    TypeError,
  );
  return true;
}

/**
 * @param {Passable} val
 * @returns {boolean}
 */
function isPassByCopyRecord(val) {
  const proto = getPrototypeOf(val);
  if (proto !== objectPrototype) {
    return false;
  }
  const descs = getOwnPropertyDescriptors(val);
  const descKeys = ownKeys(descs);

  for (const descKey of descKeys) {
    if (typeof descKey === 'symbol') {
      return false;
    }
    const desc = descs[descKey];
    if (typeof desc.value === 'function') {
      return false;
    }
  }
  for (const descKey of descKeys) {
    assert.typeof(
      descKey,
      'string',
      X`Pass by copy records can only have string-named own properties`,
    );
    const desc = descs[descKey];
    assert(
      !('get' in desc),
      X`Records must not contain accessors: ${q(descKey)}`,
      TypeError,
    );
    assert(
      desc.enumerable,
      X`Record fields must be enumerable: ${q(descKey)}`,
      TypeError,
    );
  }
  return true;
}

const makeRemotableProto = (oldProto, allegedName) => {
  assert(
    oldProto === objectPrototype || oldProto === null,
    X`For now, remotables cannot inherit from anything unusual`,
  );
  // Assign the arrow function to a variable to set its .name.
  const toString = () => `[${allegedName}]`;
  return harden(
    create(oldProto, {
      [PASS_STYLE]: { value: REMOTE_STYLE },
      toString: { value: toString },
      [Symbol.toStringTag]: { value: allegedName },
    }),
  );
};

/**
 * Throw if val is not the correct shape for the prototype of a Remotable.
 *
 * TODO: It would be nice to typedef this shape and then declare that this
 * function asserts it, but we can't declare a type with PASS_STYLE from JSDoc.
 *
 * @param {{ [PASS_STYLE]: string, [Symbol.toStringTag]: string, toString: () =>
 * void}} val the value to verify
 */
const assertRemotableProto = val => {
  assert.typeof(val, 'object', X`cannot serialize non-objects like ${val}`);
  assert(!Array.isArray(val), X`Arrays cannot be pass-by-remote`);
  assert(val !== null, X`null cannot be pass-by-remote`);

  const protoProto = getPrototypeOf(val);
  assert(
    protoProto === objectPrototype || protoProto === null,
    X`The Remotable Proto marker cannot inherit from anything unusual`,
  );
  assert(isFrozen(val), X`The Remotable proto must be frozen`);
  const {
    [PASS_STYLE]: { value: passStyleValue },
    toString: { value: toStringValue },
    // @ts-ignore https://github.com/microsoft/TypeScript/issues/1863
    [Symbol.toStringTag]: { value: toStringTagValue },
    ...rest
  } = getOwnPropertyDescriptors(val);
  assert(
    ownKeys(rest).length === 0,
    X`Unexpect properties on Remotable Proto ${ownKeys(rest)}`,
  );
  assert(
    passStyleValue === REMOTE_STYLE,
    X`Expected ${q(REMOTE_STYLE)}, not ${q(passStyleValue)}`,
  );
  assert.typeof(toStringValue, 'function', X`toString must be a function`);
  assert.typeof(toStringTagValue, 'string', X`@@toStringTag must be a string`);
};

/**
 * Ensure that val could become a legitimate remotable.  This is used
 * internally both in the construction of a new remotable and
 * mustPassByRemote.
 *
 * @param {*} val The remotable candidate to check
 */
function assertCanBeRemotable(val) {
  // throws exception if cannot
  assert.typeof(val, 'object', X`cannot serialize non-objects like ${val}`);
  assert(!Array.isArray(val), X`Arrays cannot be pass-by-remote`);
  assert(val !== null, X`null cannot be pass-by-remote`);

  const descs = getOwnPropertyDescriptors(val);
  const keys = ownKeys(descs); // enumerable-and-not, string-or-Symbol
  keys.forEach(key => {
    assert(
      // Typecast needed due to https://github.com/microsoft/TypeScript/issues/1863
      !('get' in descs[/** @type {string} */ (key)]),
      X`cannot serialize objects with getters like ${q(String(key))} in ${val}`,
    );
    assert.typeof(
      // @ts-ignore https://github.com/microsoft/TypeScript/issues/1863
      val[key],
      'function',
      X`cannot serialize objects with non-methods like ${q(
        String(key),
      )} in ${val}`,
    );
    assert(
      key !== PASS_STYLE,
      X`A pass-by-remote cannot shadow ${q(PASS_STYLE)}`,
    );
  });
}

/**
 * @param {Remotable} val
 */
function assertRemotable(val) {
  assert(isFrozen(val), X`cannot serialize non-frozen objects like ${val}`);

  assertCanBeRemotable(val);

  const p = getPrototypeOf(val);
  if (p !== null && p !== objectPrototype) {
    assertRemotableProto(p);
  }
}

/**
 * This is the equality comparison used by JavaScript's Map and Set
 * abstractions, where NaN is the same as NaN and -0 is the same as
 * 0. Marshal serializes -0 as zero, so the semantics of our distributed
 * object system does not distinguish 0 from -0.
 *
 * `sameValueZero` is the EcmaScript spec name for this equality comparison,
 * but TODO we need a better name for the API.
 *
 * @param {any} x
 * @param {any} y
 * @returns {boolean}
 */
export function sameValueZero(x, y) {
  return x === y || is(x, y);
}

/**
 * objects can only be passed in one of two/three forms:
 * 1: pass-by-remote: all properties (own and inherited) are methods,
 *    the object itself is of type object, not function
 * 2: pass-by-copy: all string-named own properties are data, not methods
 *    the object must inherit from objectPrototype or null
 * 3: the empty object is pass-by-remote, for identity comparison
 *
 * all objects must be frozen
 *
 * anything else will throw an error if you try to serialize it
 * with these restrictions, our remote call/copy protocols expose all useful
 * behavior of these objects: pass-by-remote objects have no other data (so
 * there's nothing else to copy), and pass-by-copy objects have no other
 * behavior (so there's nothing else to invoke)
 *
 * How would val be passed?  For primitive values, the answer is
 *   * 'null' for null
 *   * throwing an error for a symbol, whether registered or not.
 *   * that value's typeof string for all other primitive values
 * For frozen objects, the possible answers
 *   * 'copyRecord' for non-empty records with only data properties
 *   * 'copyArray' for arrays with only data properties
 *   * 'copyError' for instances of Error with only data properties
 *   * REMOTE_STYLE for non-array objects with only method properties
 *   * 'promise' for genuine promises only
 *   * throwing an error on anything else, including thenables.
 * We export passStyleOf so other algorithms can use this module's
 * classification.
 *
 * @param {Passable} val
 * @returns {PassStyle}
 */
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
      assert(
        isFrozen(val),
        X`Cannot pass non-frozen objects like ${val}. Use harden()`,
      );
      if (isPromise(val)) {
        return 'promise';
      }
      assert(
        typeof val.then !== 'function',
        X`Cannot pass non-promise thenables`,
      );
      if (isPassByCopyError(val)) {
        return 'copyError';
      }
      if (isPassByCopyArray(val)) {
        return 'copyArray';
      }
      if (isPassByCopyRecord(val)) {
        return 'copyRecord';
      }
      assertRemotable(val);
      // console.log(`--- @@marshal: pass-by-ref object without Far/Remotable`);
      // assert.fail(X`pass-by-ref object without Far/Remotable`);
      return REMOTE_STYLE;
    }
    case 'function': {
      assert.fail(X`Bare functions like ${val} are disabled for now`);
    }
    case 'undefined':
    case 'string':
    case 'boolean':
    case 'number':
    case 'bigint':
    case 'symbol': {
      return typestr;
    }
    default: {
      assert.fail(X`Unrecognized typeof ${q(typestr)}`, TypeError);
    }
  }
}

/**
 * Special property name that indicates an encoding that needs special
 * decoding.
 */
const QCLASS = '@qclass';
export { QCLASS };

/**
 * @template Slot
 * @type {ConvertValToSlot<Slot>}
 */
const defaultValToSlotFn = x => x;
/**
 * @template Slot
 * @type {ConvertSlotToVal<Slot>}
 */
const defaultSlotToValFn = (x, _) => x;

/**
 * @template Slot
 * @type {MakeMarshal<Slot>}
 */
export function makeMarshal(
  convertValToSlot = defaultValToSlotFn,
  convertSlotToVal = defaultSlotToValFn,
  {
    errorTagging = 'on',
    marshalName = 'anon-marshal',
    // TODO Temporary hack.
    // See https://github.com/Agoric/agoric-sdk/issues/2780
    errorIdNum = 10000,
    // We prefer that the caller instead log to somewhere hidden
    // to be revealed when correlating with the received error.
    marshalSaveError = err =>
      console.log('Temporary logging of sent error', err),
  } = {},
) {
  assert.typeof(marshalName, 'string');
  assert(
    errorTagging === 'on' || errorTagging === 'off',
    X`The errorTagging option can only be "on" or "off" ${errorTagging}`,
  );
  const nextErrorId = () => {
    errorIdNum += 1;
    return `error:${marshalName}#${errorIdNum}`;
  };

  /**
   * @template Slot
   * @param {Passable} val
   * @param {Slot[]} slots
   * @param {WeakMap<Passable,number>} slotMap
   * @param {InterfaceSpec=} iface
   * @returns {Encoding}
   */
  function serializeSlot(val, slots, slotMap, iface = undefined) {
    let slotIndex;
    if (slotMap.has(val)) {
      slotIndex = slotMap.get(val);
      assert.typeof(slotIndex, 'number');
    } else {
      const slot = convertValToSlot(val);

      slotIndex = slots.length;
      slots.push(slot);
      slotMap.set(val, slotIndex);
    }

    /*
    if (iface === undefined && passStyleOf(val) === REMOTE_STYLE) {
      // iface = `Alleged: remotable at slot ${slotIndex}`;
      if (
        getPrototypeOf(val) === objectPrototype &&
        ownKeys(val).length === 0
      ) {
        // For now, skip the diagnostic if we have a pure empty object
      } else {
        try {
          assert.fail(X`Serialize ${val} generates needs iface`);
        } catch (err) {
          console.info(err);
        }
      }
    }
    */

    if (iface === undefined) {
      return harden({
        [QCLASS]: 'slot',
        index: slotIndex,
      });
    }
    return harden({
      [QCLASS]: 'slot',
      iface,
      index: slotIndex,
    });
  }

  /**
   * @template Slot
   * @type {Serialize<Slot>}
   */
  const serialize = root => {
    const slots = [];
    // maps val (promise or remotable) to index of slots[]
    const slotMap = new Map();
    const ibidTable = makeReplacerIbidTable();

    /**
     * Must encode `val` into plain JSON data *canonically*, such that
     * `sameStructure(v1, v2)` implies
     * `JSON.stringify(encode(v1)) === JSON.stringify(encode(v2))`
     * For each record, we only accept sortable property names
     * (no anonymous symbols). On the encoded form the sort
     * order of these names must be the same as their enumeration
     * order, so a `JSON.stringify` of the encoded form agrees with
     * a canonical-json stringify of the encoded form.
     *
     * @param {Passable} val
     * @returns {Encoding}
     */
    const encode = val => {
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
          if (is(val, -0)) {
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
        case 'symbol': {
          switch (val) {
            case Symbol.asyncIterator: {
              return harden({
                [QCLASS]: '@@asyncIterator',
              });
            }
            default: {
              assert.fail(X`Unsupported symbol ${q(String(val))}`);
            }
          }
        }
        default: {
          // if we've seen this object before, serialize a backref
          if (ibidTable.has(val)) {
            // Backreference to prior occurrence
            const index = ibidTable.get(val);
            assert.typeof(index, 'number');
            return harden({
              [QCLASS]: 'ibid',
              index,
            });
          }
          ibidTable.add(val);

          switch (passStyle) {
            case 'copyRecord': {
              if (QCLASS in val) {
                // Hilbert hotel
                const { [QCLASS]: qclassValue, ...rest } = val;
                if (ownKeys(rest).length === 0) {
                  return harden({
                    [QCLASS]: 'hilbert',
                    original: encode(qclassValue),
                  });
                } else {
                  return harden({
                    [QCLASS]: 'hilbert',
                    original: encode(qclassValue),
                    // This means the rest will get an ibid entry even
                    // though it is not any of the original objects.
                    rest: encode(harden(rest)),
                  });
                }
              }
              // Currently copyRecord allows only string keys so this will
              // work. If we allow sortable symbol keys, this will need to
              // become more interesting.
              const names = ownKeys(val).sort();
              return fromEntries(names.map(name => [name, encode(val[name])]));
            }
            case 'copyArray': {
              return val.map(encode);
            }
            case 'copyError': {
              // We deliberately do not share the stack, but it would
              // be useful to log the stack locally so someone who has
              // privileged access to the throwing Vat can correlate
              // the problem with the remote Vat that gets this
              // summary. If we do that, we could allocate some random
              // identifier and include it in the message, to help
              // with the correlation.

              if (errorTagging === 'on') {
                const errorId = nextErrorId();
                assert.note(val, X`Sent as ${errorId}`);
                marshalSaveError(val);
                return harden({
                  [QCLASS]: 'error',
                  errorId,
                  message: `${val.message}`,
                  name: `${val.name}`,
                });
              } else {
                return harden({
                  [QCLASS]: 'error',
                  message: `${val.message}`,
                  name: `${val.name}`,
                });
              }
            }
            case REMOTE_STYLE: {
              const iface = getInterfaceOf(val);
              // console.log(`serializeSlot: ${val}`);
              return serializeSlot(val, slots, slotMap, iface);
            }
            case 'promise': {
              // console.log(`serializeSlot: ${val}`);
              return serializeSlot(val, slots, slotMap);
            }
            default: {
              assert.fail(X`unrecognized passStyle ${q(passStyle)}`, TypeError);
            }
          }
        }
      }
    };

    const encoded = encode(root);

    return harden({
      body: JSON.stringify(encoded),
      slots,
    });
  };

  function makeFullRevive(slots, cyclePolicy) {
    // ibid table is shared across recursive calls to fullRevive.
    const ibidTable = makeReviverIbidTable(cyclePolicy);

    /**
     * We stay close to the algorithm at
     * https://tc39.github.io/ecma262/#sec-json.parse , where
     * fullRevive(harden(JSON.parse(str))) is like JSON.parse(str, revive))
     * for a similar reviver. But with the following differences:
     *
     * Rather than pass a reviver to JSON.parse, we first call a plain
     * (one argument) JSON.parse to get rawTree, and then post-process
     * the rawTree with fullRevive. The kind of revive function
     * handled by JSON.parse only does one step in post-order, with
     * JSON.parse doing the recursion. By contrast, fullParse does its
     * own recursion, enabling it to interpret ibids in the same
     * pre-order in which the replacer visited them, and enabling it
     * to break cycles.
     *
     * In order to break cycles, the potentially cyclic objects are
     * not frozen during the recursion. Rather, the whole graph is
     * hardened before being returned. Error objects are not
     * potentially recursive, and so may be harmlessly hardened when
     * they are produced.
     *
     * fullRevive can produce properties whose value is undefined,
     * which a JSON.parse on a reviver cannot do. If a reviver returns
     * undefined to JSON.parse, JSON.parse will delete the property
     * instead.
     *
     * fullRevive creates and returns a new graph, rather than
     * modifying the original tree in place.
     *
     * fullRevive may rely on rawTree being the result of a plain call
     * to JSON.parse. However, it *cannot* rely on it having been
     * produced by JSON.stringify on the replacer above, i.e., it
     * cannot rely on it being a valid marshalled
     * representation. Rather, fullRevive must validate that.
     *
     * @param {Encoding} rawTree must be hardened
     */
    function fullRevive(rawTree) {
      if (Object(rawTree) !== rawTree) {
        // primitives pass through
        return rawTree;
      }
      // Assertions of the above to narrow the type.
      assert.typeof(rawTree, 'object');
      assert(rawTree !== null);
      if (QCLASS in rawTree) {
        const qclass = rawTree[QCLASS];
        assert.typeof(
          qclass,
          'string',
          X`invalid qclass typeof ${q(typeof qclass)}`,
        );
        assert(!Array.isArray(rawTree));
        // Switching on `encoded[QCLASS]` (or anything less direct, like
        // `qclass`) does not discriminate rawTree in typescript@4.2.3 and
        // earlier.
        switch (rawTree['@qclass']) {
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
            const { digits } = rawTree;
            assert.typeof(
              digits,
              'string',
              X`invalid digits typeof ${q(typeof digits)}`,
            );
            return BigInt(digits);
          }
          case '@@asyncIterator': {
            return Symbol.asyncIterator;
          }

          case 'ibid': {
            const { index } = rawTree;
            return ibidTable.get(index);
          }

          case 'error': {
            const { name, message, errorId } = rawTree;
            assert.typeof(
              name,
              'string',
              X`invalid error name typeof ${q(typeof name)}`,
            );
            assert.typeof(
              message,
              'string',
              X`invalid error message typeof ${q(typeof message)}`,
            );
            const EC = getErrorConstructor(`${name}`) || Error;
            // errorId is a late addition so be tolerant of its absence.
            const errorName =
              errorId === undefined
                ? `Remote${EC.name}`
                : `Remote${EC.name}(${errorId})`;
            const error = assert.error(`${message}`, EC, { errorName });
            ibidTable.register(error);
            return error;
          }

          case 'slot': {
            const { index, iface } = rawTree;
            const slot = slots[Number(Nat(index))];
            return ibidTable.register(convertSlotToVal(slot, iface));
          }

          case 'hilbert': {
            const { original, rest } = rawTree;
            assert(
              'original' in rawTree,
              X`Invalid Hilbert Hotel encoding ${rawTree}`,
            );
            const result = ibidTable.start({});
            result[QCLASS] = fullRevive(original);
            if ('rest' in rawTree) {
              assert(
                rest !== undefined,
                X`Rest encoding must not be undefined`,
              );
              const restObj = fullRevive(rest);
              // TODO really should assert that `passStyleOf(rest)` is
              // `'copyRecord'` but we'd have to harden it and it is too
              // early to do that.
              assert(
                !(QCLASS in restObj),
                X`Rest must not contain its own definition of ${q(QCLASS)}`,
              );
              defineProperties(result, getOwnPropertyDescriptors(restObj));
            }
            return ibidTable.finish(result);
          }

          default: {
            assert.fail(X`unrecognized ${q(QCLASS)} ${q(qclass)}`, TypeError);
          }
        }
      } else if (Array.isArray(rawTree)) {
        const { length } = rawTree;
        const result = ibidTable.start([]);
        for (let i = 0; i < length; i += 1) {
          result[i] = fullRevive(rawTree[i]);
        }
        return ibidTable.finish(result);
      } else {
        const result = ibidTable.start({});
        for (const name of ownKeys(rawTree)) {
          assert.typeof(
            name,
            'string',
            X`Property ${name} of ${rawTree} must be a string`,
          );
          result[name] = fullRevive(rawTree[name]);
        }
        return ibidTable.finish(result);
      }
    }
    return fullRevive;
  }

  /**
   * @template Slot
   * @type {Unserialize<Slot>}
   */
  function unserialize(data, cyclePolicy = 'forbidCycles') {
    assert.typeof(
      data.body,
      'string',
      X`unserialize() given non-capdata (.body is ${data.body}, not string)`,
    );
    assert(
      Array.isArray(data.slots),
      X`unserialize() given non-capdata (.slots are not Array)`,
    );
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
 * @param {InterfaceSpec} [iface='Remotable'] The interface specification for
 * the remotable. For now, a string iface must be "Remotable" or begin with
 * "Alleged: ", to serve as the alleged name. More general ifaces are not yet
 * implemented. This is temporary. We include the
 * "Alleged" as a reminder that we do not yet have SwingSet or Comms Vat
 * support for ensuring this is according to the vat hosting the object.
 * Currently, Alice can tell Bob about Carol, where VatA (on Alice's behalf)
 * misrepresents Carol's `iface`. VatB and therefore Bob will then see
 * Carol's `iface` as misrepresented by VatA.
 * @param {undefined} [props=undefined] Currently may only be undefined.
 * That plan is that own-properties are copied to the remotable
 * @param {object} [remotable={}] The object used as the remotable
 * @returns {object} remotable, modified for debuggability
 */
const Remotable = (iface = 'Remotable', props = undefined, remotable = {}) => {
  // TODO unimplemented
  assert.typeof(
    iface,
    'string',
    X`Interface ${iface} must be a string; unimplemented`,
  );
  // TODO unimplemented
  assert(
    iface === 'Remotable' || iface.startsWith('Alleged: '),
    X`For now, iface ${q(
      iface,
    )} must be "Remotable" or begin with "Alleged: "; unimplemented`,
  );
  iface = pureCopy(harden(iface));
  // TODO: When iface is richer than just string, we need to get the allegedName
  // in a different way.
  const allegedName = iface;
  assert(props === undefined, X`Remotable props not yet implemented ${props}`);

  // Fail fast: check that the unmodified object is able to become a Remotable.
  assertCanBeRemotable(remotable);

  // Ensure that the remotable isn't already marked.
  assert(
    !(PASS_STYLE in remotable),
    X`Remotable ${remotable} is already marked as a ${q(
      remotable[PASS_STYLE],
    )}`,
  );
  // Ensure that the remotable isn't already frozen.
  assert(!isFrozen(remotable), X`Remotable ${remotable} is already frozen`);
  const remotableProto = makeRemotableProto(
    getPrototypeOf(remotable),
    allegedName,
  );

  // Take a static copy of the enumerable own properties as data properties.
  // const propDescs = getOwnPropertyDescriptors({ ...props });
  const mutateHardenAndCheck = target => {
    // defineProperties(target, propDescs);
    setPrototypeOf(target, remotableProto);
    harden(target);
    assertCanBeRemotable(target);
  };

  // Fail fast: check a fresh remotable to see if our rules fit.
  mutateHardenAndCheck({});

  // Actually finish the new remotable.
  mutateHardenAndCheck(remotable);

  // COMMITTED!
  // We're committed, so keep the interface for future reference.
  assert(iface !== undefined); // To make TypeScript happy
  return remotable;
};

harden(Remotable);
export { Remotable };

/**
 * A concise convenience for the most common `Remotable` use.
 *
 * @param {string} farName This name will be prepended with `Alleged: `
 * for now to form the `Remotable` `iface` argument.
 * @param {object} [remotable={}] The object used as the remotable
 * @returns {object} remotable, modified for debuggability
 */
const Far = (farName, remotable = {}) =>
  Remotable(`Alleged: ${farName}`, undefined, remotable);

harden(Far);
export { Far };
