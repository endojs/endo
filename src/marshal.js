// @ts-check

// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import Nat from '@agoric/nat';
import { assert, details as X, q } from '@agoric/assert';
import { isPromise } from '@agoric/promise-kit';

import './types';

const {
  getPrototypeOf,
  setPrototypeOf,
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
    assert.fail(
      X`Errors must inherit from an error class .prototype ${val}`,
      TypeError,
    );
  }

  const {
    message: mDesc,
    // Allow but ignore only extraneous own `stack` property.
    stack: _optStackDesc,
    ...restDescs
  } = getOwnPropertyDescriptors(val);
  const restKeys = ownKeys(restDescs);
  assert(
    restKeys.length === 0,
    X`Unexpected own properties in error: ${q(restKeys)}`,
    TypeError,
  );
  if (mDesc) {
    assert.typeof(mDesc.value, 'string', X`Malformed error object: ${val}`);
    assert(
      !mDesc.enumerable,
      X`An error's .message must not be enumerable`,
      TypeError,
    );
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
  if (getPrototypeOf(val) !== objectPrototype) {
    return false;
  }
  const descs = getOwnPropertyDescriptors(val);
  const descKeys = ownKeys(descs);
  if (descKeys.length === 0) {
    // empty non-array objects are pass-by-remote, not pass-by-copy
    // TODO Beware: Unmarked empty records will become pass-by-copy
    // See https://github.com/Agoric/agoric-sdk/issues/2018
    return false;
  }
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
  return harden({
    __proto__: oldProto,
    [PASS_STYLE]: REMOTE_STYLE,
    toString,
    [Symbol.toStringTag]: allegedName,
  });
};

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
    // @ts-ignore
    [PASS_STYLE]: { value: passStyleValue },
    // @ts-ignore
    toString: { value: toStringValue },
    // @ts-ignore
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
      // @ts-ignore
      !('get' in descs[key]),
      X`cannot serialize objects with getters like ${q(String(key))} in ${val}`,
    );
    assert.typeof(
      val[key],
      'function',
      X`cannot serialize objects with non-methods like ${q(
        String(key),
      )} in ${val}`,
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
 * The ibid logic relies on
 *    * JSON.stringify on an array visiting array indexes from 0 to
 *      arr.length -1 in order, and not visiting anything else.
 *    * JSON.parse of a record (a plain object) creating an object on
 *      which a getOwnPropertyNames will enumerate properties in the
 *      same order in which they appeared in the parsed JSON string.
 */
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
      assert(index < ibids.length, X`ibid out of range: ${index}`, RangeError);
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
            assert.fail(X`Ibid cycle at ${q(index)}`, TypeError);
          }
          default: {
            assert.fail(
              X`Unrecognized cycle policy: ${q(cyclePolicy)}`,
              TypeError,
            );
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
  { marshalName = 'anon-marshal', errorTagging = 'on' } = {},
) {
  assert.typeof(marshalName, 'string');
  assert(
    errorTagging === 'on' || errorTagging === 'off',
    X`The errorTagging option can only be "on" or "off" ${errorTagging}`,
  );
  // Ascending numbers identifying the sending of errors relative to this
  // marshal instance.
  let errorCount = 0;
  const nextErrorId = () => {
    errorCount += 1;
    return `error:${marshalName}#${errorCount}`;
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
     * Just consists of data that rounds trips to plain data.
     *
     * @typedef {any} PlainJSONData
     */

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
     * @returns {PlainJSONData}
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
            return harden({
              [QCLASS]: 'ibid',
              index: ibidTable.get(val),
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
                // TODO we need to instead log to somewhere hidden
                // to be revealed when correlating with the received error.
                // By sending this to `console.log`, under swingset this is
                // enabled by `agoric start --reset -v` and not enabled without
                // the `-v` flag.
                console.log('Temporary logging of sent error', val);
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

    // We stay close to the algorithm at
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
        assert.typeof(
          qclass,
          'string',
          X`invalid qclass typeof ${q(typeof qclass)}`,
        );
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
            assert.typeof(
              rawTree.digits,
              'string',
              X`invalid digits typeof ${q(typeof rawTree.digits)}`,
            );
            /* eslint-disable-next-line no-undef */
            return BigInt(rawTree.digits);
          }
          case '@@asyncIterator': {
            return Symbol.asyncIterator;
          }

          case 'ibid': {
            return ibidTable.get(rawTree.index);
          }

          case 'error': {
            assert.typeof(
              rawTree.name,
              'string',
              X`invalid error name typeof ${q(typeof rawTree.name)}`,
            );
            assert.typeof(
              rawTree.message,
              'string',
              X`invalid error message typeof ${q(typeof rawTree.message)}`,
            );
            const EC = getErrorConstructor(`${rawTree.name}`) || Error;
            const error = harden(new EC(`${rawTree.message}`));
            ibidTable.register(error);
            if (typeof rawTree.errorId === 'string') {
              // errorId is a late addition so be tolerant of its absence.
              assert.note(error, X`Received as ${rawTree.errorId}`);
            }
            return error;
          }

          case 'slot': {
            const slot = slots[Nat(rawTree.index)];
            return ibidTable.register(convertSlotToVal(slot, rawTree.iface));
          }

          case 'hilbert': {
            assert(
              'original' in rawTree,
              X`Invalid Hilbert Hotel encoding ${rawTree}`,
            );
            const result = ibidTable.start({});
            result[QCLASS] = fullRevive(rawTree.original);
            if ('rest' in rawTree) {
              const rest = fullRevive(rawTree.rest);
              // TODO really should assert that `passStyleOf(rest)` is
              // `'copyRecord'` but we'd have to harden it and it is too
              // early to do that.
              assert(
                !(QCLASS in rest),
                X`Rest must not contain its own definition of ${q(QCLASS)}`,
              );
              defineProperties(result, getOwnPropertyDescriptors(rest));
            }
            return ibidTable.finish(result);
          }

          default: {
            assert.fail(X`unrecognized ${q(QCLASS)} ${q(qclass)}`, TypeError);
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
        const names = ownKeys(rawTree);
        for (const name of names) {
          assert.typeof(name, 'string');
          result[name] = fullRevive(rawTree[name]);
        }
        return ibidTable.finish(result);
      }
    };
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
function Remotable(iface = 'Remotable', props = undefined, remotable = {}) {
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
}

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
