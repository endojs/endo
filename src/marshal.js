// @ts-check

// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import { Nat } from '@agoric/nat';
import { assert, details as X, q } from '@agoric/assert';
import {
  PASS_STYLE,
  passStyleOf,
  getInterfaceOf,
  getErrorConstructor,
  assertCanBeRemotable,
  assertIface,
} from './passStyleOf.js';

import './types.js';

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

/**
 * Do a deep copy of the object, handling Proxies and recursion.
 * The resulting copy is guaranteed to be pure data, as well as hardened.
 * Such a hardened, pure copy cannot be used as a communications path.
 *
 * @template {OnlyData} T
 * @param {T} val input value.  NOTE: Must be hardened!
 * @returns {T} pure, hardened copy
 */
export const pureCopy = val => {
  // passStyleOf now asserts that val has no pass-by-copy cycles.
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

      // Create a new identity.
      const copy = /** @type {T} */ (passStyle === 'copyArray' ? [] : {});

      // Make a deep copy on the new identity.
      // Object.entries(obj) takes a snapshot (even if a Proxy).
      // Since we already know it is a copyRecord or copyArray, we
      // know that Object.entries is safe enough. On a copyRecord it
      // will represent all the own properties. On a copyArray it
      // will represent all the own properties except for the length.
      Object.entries(obj).forEach(([prop, value]) => {
        copy[prop] = pureCopy(value);
      });
      return harden(copy);
    }

    case 'copyError': {
      // passStyleOf is currently not fully validating of error objects,
      // in order to tolerate malformed error objects to preserve the initial
      // complaint, rather than complain about the form of the complaint.
      // However, pureCopy(error) must be safe. We should obtain nothing from
      // the error object other than the `name` and `message` and we should
      // only copy stringified forms of these, where `name` must be an
      // error constructor name.
      const unk = /** @type {unknown} */ (val);
      const err = /** @type {Error} */ (unk);

      const { name, message } = err;

      const EC = getErrorConstructor(`${name}`) || Error;
      const copy = harden(new EC(`${message}`));
      // Even the cleaned up error copy, if sent to the console, should
      // cause hidden diagnostic information of the original error
      // to be logged.
      assert.note(copy, X`copied from error ${err}`);

      const unk2 = /** @type {unknown} */ (harden(copy));
      return /** @type {T} */ (unk2);
    }

    case 'remotable': {
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
};
harden(pureCopy);

/**
 * @param {Object|null} oldProto
 * @param {InterfaceSpec} iface
 * @returns {Object}
 */
const makeRemotableProto = (oldProto, iface) => {
  assert(
    oldProto === objectPrototype || oldProto === null,
    X`For now, remotables cannot inherit from anything unusual`,
  );
  // Assign the arrow function to a variable to set its .name.
  const toString = () => `[${iface}]`;
  return harden(
    create(oldProto, {
      [PASS_STYLE]: { value: 'remotable' },
      toString: { value: toString },
      [Symbol.toStringTag]: { value: iface },
    }),
  );
};

/**
 * Special property name that indicates an encoding that needs special
 * decoding.
 */
const QCLASS = '@qclass';
export { QCLASS };

const defaultValToSlotFn = x => x;
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
   * @type {Serialize<Slot>}
   */
  const serialize = root => {
    const slots = [];
    // maps val (promise or remotable) to index of slots[]
    const slotMap = new Map();
    // for cycle detection
    const unfinished = new WeakSet();

    /**
     * @param {Passable} val
     * @param {InterfaceSpec=} iface
     * @returns {Encoding}
     */
    function serializeSlot(val, iface = undefined) {
      let slotIndex;
      if (slotMap.has(val)) {
        slotIndex = slotMap.get(val);
        assert.typeof(slotIndex, 'number');
        iface = undefined;
      } else {
        const slot = convertValToSlot(val);

        slotIndex = slots.length;
        slots.push(slot);
        slotMap.set(val, slotIndex);
      }

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
          assert(
            !unfinished.has(val),
            X`Pass-by-copy data must be acyclic ${val}`,
          );

          switch (passStyle) {
            case 'copyRecord': {
              if (QCLASS in val) {
                // Hilbert hotel
                const { [QCLASS]: qclassValue, ...rest } = val;
                if (ownKeys(rest).length === 0) {
                  unfinished.add(val);
                  /** @type {Encoding} */
                  const result = harden({
                    [QCLASS]: 'hilbert',
                    original: encode(qclassValue),
                  });
                  unfinished.delete(val);
                  return result;
                } else {
                  unfinished.add(val);
                  /** @type {Encoding} */
                  const result = harden({
                    [QCLASS]: 'hilbert',
                    original: encode(qclassValue),
                    rest: encode(harden(rest)),
                  });
                  unfinished.delete(val);
                  return result;
                }
              }
              // Currently copyRecord allows only string keys so this will
              // work. If we allow sortable symbol keys, this will need to
              // become more interesting.
              const names = ownKeys(val).sort();
              unfinished.add(val);
              const result = fromEntries(
                names.map(name => [name, encode(val[name])]),
              );
              unfinished.delete(val);
              return result;
            }
            case 'copyArray': {
              unfinished.add(val);
              const result = val.map(encode);
              unfinished.delete(val);
              return result;
            }
            case 'copyError': {
              if (errorTagging === 'on') {
                // We deliberately do not share the stack, but it would
                // be useful to log the stack locally so someone who has
                // privileged access to the throwing Vat can correlate
                // the problem with the remote Vat that gets this
                // summary. If we do that, we could allocate some random
                // identifier and include it in the message, to help
                // with the correlation.
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
            case 'remotable': {
              const iface = getInterfaceOf(val);
              // console.log(`serializeSlot: ${val}`);
              return serializeSlot(val, iface);
            }
            case 'promise': {
              // console.log(`serializeSlot: ${val}`);
              return serializeSlot(val);
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

  const makeFullRevive = slots => {
    /** @type {Map<number, Passable>} */
    const valMap = new Map();

    function unserializeSlot(index, iface) {
      if (valMap.has(index)) {
        return valMap.get(index);
      }
      const slot = slots[Number(Nat(index))];
      const val = convertSlotToVal(slot, iface);
      valMap.set(index, val);
      return val;
    }

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
     * own recursion in the same pre-order in which the replacer visited them.
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
            return error;
          }

          case 'slot': {
            const { index, iface } = rawTree;
            const val = unserializeSlot(index, iface);
            return val;
          }

          case 'hilbert': {
            const { original, rest } = rawTree;
            assert(
              'original' in rawTree,
              X`Invalid Hilbert Hotel encoding ${rawTree}`,
            );
            // Don't harden since we're not done mutating it
            const result = { [QCLASS]: fullRevive(original) };
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
            return result;
          }

          default: {
            assert(
              qclass !== 'ibid',
              X`The protocol no longer supports ibid encoding: ${rawTree}.`,
            );
            assert.fail(X`unrecognized ${q(QCLASS)} ${q(qclass)}`, TypeError);
          }
        }
      } else if (Array.isArray(rawTree)) {
        const result = [];
        const { length } = rawTree;
        for (let i = 0; i < length; i += 1) {
          result[i] = fullRevive(rawTree[i]);
        }
        return result;
      } else {
        const result = {};
        for (const name of ownKeys(rawTree)) {
          assert.typeof(
            name,
            'string',
            X`Property ${name} of ${rawTree} must be a string`,
          );
          result[name] = fullRevive(rawTree[name]);
        }
        return result;
      }
    }
    return fullRevive;
  };

  /**
   * @template Slot
   * @type {Unserialize<Slot>}
   */
  const unserialize = data => {
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
    const fullRevive = makeFullRevive(data.slots);
    return harden(fullRevive(rawTree));
  };

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
  assertIface(iface);
  iface = pureCopy(harden(iface));
  assert(iface);
  // TODO: When iface is richer than just string, we need to get the allegedName
  // in a different way.
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
  const remotableProto = makeRemotableProto(getPrototypeOf(remotable), iface);

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
 * @template T
 * @param {string} farName This name will be prepended with `Alleged: `
 * for now to form the `Remotable` `iface` argument.
 * @param {T|undefined} [remotable={}] The object used as the remotable
 * @returns {T} remotable, modified for debuggability
 */
const Far = (farName, remotable = undefined) => {
  const r = remotable === undefined ? {} : remotable;
  return Remotable(`Alleged: ${farName}`, undefined, r);
};

harden(Far);
export { Far };
