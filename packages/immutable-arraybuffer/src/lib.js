/* global globalThis */

const {
  ArrayBuffer,
  Object,
  Reflect,
  Symbol,
  TypeError,
  Uint8Array,
  WeakMap,
  // Capture structuredClone before it can be scuttled.
  structuredClone: optStructuredClone,
  // eslint-disable-next-line no-restricted-globals
} = globalThis;

const { freeze, defineProperty, getOwnPropertyDescriptor, getPrototypeOf } =
  Object;
const { apply, ownKeys } = Reflect;

// Capture the WeakMap prototype methods up front so we can use them with
// `apply` below, without exposing the `buffers` WeakMap to post-hoc
// prototype lookups or polymorphic dispatch.
const { get: weakmapGet, set: weakmapSet, has: weakmapHas } = WeakMap.prototype;

const { prototype: arrayBufferPrototype } = ArrayBuffer;
const {
  slice,
  transfer: optTransfer,
  resize: optResize,
  transferToFixedLength: optTransferToFixedLength,
} = arrayBufferPrototype;
// @ts-expect-error TS doesn't know it'll be there
const { get: arrayBufferByteLength } = getOwnPropertyDescriptor(
  arrayBufferPrototype,
  'byteLength',
);

// Capture the resizable-ArrayBuffer proposal's accessors when present. On
// platforms without that proposal (Node <= 18, Hermes), these are absent;
// the fallthrough branches in the lib property record short-circuit on
// brand membership and never reach the captured accessor in that case
// (an emulated immutable always has `detached === false`, `resizable ===
// false`, and `maxByteLength === byteLength`).
const optArrayBufferDetached = getOwnPropertyDescriptor(
  arrayBufferPrototype,
  'detached',
)?.get;
const optArrayBufferResizable = getOwnPropertyDescriptor(
  arrayBufferPrototype,
  'resizable',
)?.get;
const optArrayBufferMaxByteLength = getOwnPropertyDescriptor(
  arrayBufferPrototype,
  'maxByteLength',
)?.get;

const typedArrayPrototype = getPrototypeOf(Uint8Array.prototype);
const { set: uint8ArraySet } = typedArrayPrototype;
// @ts-expect-error TS doesn't know it'll be there
const { get: uint8ArrayBuffer } = getOwnPropertyDescriptor(
  typedArrayPrototype,
  'buffer',
);

/**
 * Copy a range of values from a genuine ArrayBuffer exotic object into a new
 * ArrayBuffer.
 *
 * @param {ArrayBuffer} realBuffer
 * @param {number} [start]
 * @param {number} [end]
 * @returns {ArrayBuffer}
 */
const arrayBufferSlice = (realBuffer, start = undefined, end = undefined) =>
  apply(slice, realBuffer, [start, end]);

/**
 * Move the contents of a genuine ArrayBuffer exotic object into a new fresh
 * ArrayBuffer and detach the original source.
 * We can only do this on platforms that support `structuredClone` or
 * `ArrayBuffer.prototype.transfer`.
 * On other platforms, we can still emulate
 * `ArrayBuffer.prototoype.sliceToImmutable`, but not
 * `ArrayBuffer.prototype.transferToImmutable`.
 * See the package README section "Platform support for `transferToImmutable`"
 * for the per-engine version thresholds and feature-testing guidance.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {ArrayBuffer}
 */
let optArrayBufferTransfer;

if (optTransfer) {
  optArrayBufferTransfer = arrayBuffer => apply(optTransfer, arrayBuffer, []);
} else if (optStructuredClone) {
  optArrayBufferTransfer = arrayBuffer => {
    // Hopefully, a zero-length slice is cheap, but still enforces that
    // `arrayBuffer` is a genuine `ArrayBuffer` exotic object.
    arrayBufferSlice(arrayBuffer, 0, 0);
    return optStructuredClone(arrayBuffer, {
      transfer: [arrayBuffer],
    });
  };
} else {
  // Assignment is redundant, but remains for clarity.
  optArrayBufferTransfer = undefined;
}

/**
 * If we could use classes with private fields everywhere, this would have
 * been a `this.#buffer` private field on an `ImmutableArrayBufferInternal`
 * class. But we cannot do so on Hermes. So, instead, we
 * emulate the `this.#buffer` private field, including its use as a brand check.
 * Maps from all and only emulated Immutable ArrayBuffers to real ArrayBuffers.
 *
 * @type {WeakMap<ArrayBuffer, ArrayBuffer>}
 */
const buffers = new WeakMap();
const isEmulatedImmutable = buf => apply(weakmapHas, buffers, [buf]);

/**
 * Amplifier-with-this-fallthrough: returns the underlying genuine
 * `ArrayBuffer` when `arrayBuffer` is an emulated immutable buffer (in the
 * brand WeakMap), and returns `arrayBuffer` itself otherwise. This lets the
 * methods on the shared `ArrayBuffer.prototype` (after the shim install)
 * work as drop-in replacements for the genuine methods when invoked on a
 * genuine `ArrayBuffer`, while transparently reaching the underlying buffer
 * for the emulated-immutable case. The name aligns with the analogous
 * `amplifyTypedArray` on the freezable-TypedArray experiment branch.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {ArrayBuffer}
 */
const amplifyArrayBuffer = arrayBuffer => {
  const result = apply(weakmapGet, buffers, [arrayBuffer]);
  if (result !== undefined) {
    return result;
  }
  return arrayBuffer;
};

/**
 * A plain record of the properties the shim copies onto
 * `ArrayBuffer.prototype` to install immutable-ArrayBuffer support. This is
 * not a prototype of any object: emulated immutable buffers directly inherit
 * from `ArrayBuffer.prototype`, and the methods here become the ones the
 * (now shared) prototype dispatches to. Each method either calls
 * `amplifyArrayBuffer(this)` to reach the underlying buffer (read accessors,
 * `slice`, `sliceToImmutable`) or discriminates on brand WeakMap membership
 * and delegates to the captured genuine method on fallthrough (the mutators
 * `resize`, `transfer`, `transferToFixedLength`, `transferToImmutable`).
 *
 * Omits `constructor` so the original `ArrayBuffer.prototype.constructor` is unchanged.
 */
export const immutableArrayBufferLibProperties = {
  __proto__: null,
  /**
   * @this {ArrayBuffer}
   */
  get byteLength() {
    return apply(arrayBufferByteLength, amplifyArrayBuffer(this), []);
  },
  /**
   * @this {ArrayBuffer}
   */
  get detached() {
    if (isEmulatedImmutable(this)) {
      return false;
    }
    // Genuine `ArrayBuffer.prototype.detached` is a stage-finished accessor
    // on platforms with the resizable-ArrayBuffer proposal. On older
    // platforms (Node <= 18, Hermes) it does not exist; the conservative
    // answer for a non-detached genuine buffer in that case is false.
    if (optArrayBufferDetached === undefined) {
      return false;
    }
    return apply(optArrayBufferDetached, this, []);
  },
  /**
   * @this {ArrayBuffer}
   */
  get maxByteLength() {
    if (isEmulatedImmutable(this)) {
      // For an emulated immutable buffer, maxByteLength is byteLength: it
      // cannot grow.
      return apply(arrayBufferByteLength, amplifyArrayBuffer(this), []);
    }
    if (optArrayBufferMaxByteLength === undefined) {
      return apply(arrayBufferByteLength, this, []);
    }
    return apply(optArrayBufferMaxByteLength, this, []);
  },
  /**
   * @this {ArrayBuffer}
   */
  get resizable() {
    if (isEmulatedImmutable(this)) {
      return false;
    }
    if (optArrayBufferResizable === undefined) {
      return false;
    }
    return apply(optArrayBufferResizable, this, []);
  },
  /**
   * @this {ArrayBuffer}
   */
  get immutable() {
    return isEmulatedImmutable(this);
  },
  /**
   * @this {ArrayBuffer}
   * @param {number} [start]
   * @param {number} [end]
   */
  slice(start = undefined, end = undefined) {
    return arrayBufferSlice(amplifyArrayBuffer(this), start, end);
  },
  /**
   * @this {ArrayBuffer}
   * @param {number} [start]
   * @param {number} [end]
   */
  sliceToImmutable(start = undefined, end = undefined) {
    // eslint-disable-next-line no-use-before-define
    return sliceBufferToImmutable(amplifyArrayBuffer(this), start, end);
  },
  /**
   * @this {ArrayBuffer}
   * @param {number} [newByteLength]
   */
  resize(newByteLength = undefined) {
    if (isEmulatedImmutable(this)) {
      throw TypeError('Cannot resize an immutable ArrayBuffer');
    }
    if (optResize === undefined) {
      throw TypeError(
        'Cannot resize ArrayBuffer: underlying platform lacks ArrayBuffer.prototype.resize',
      );
    }
    return apply(optResize, this, [newByteLength]);
  },
  /**
   * @this {ArrayBuffer}
   * @param {number} [newLength]
   */
  transfer(newLength = undefined) {
    if (isEmulatedImmutable(this)) {
      throw TypeError('Cannot detach an immutable ArrayBuffer');
    }
    if (optTransfer === undefined) {
      throw TypeError(
        'Cannot transfer ArrayBuffer: underlying platform lacks ArrayBuffer.prototype.transfer',
      );
    }
    return apply(optTransfer, this, [newLength]);
  },
  /**
   * @this {ArrayBuffer}
   * @param {number} [newLength]
   */
  transferToFixedLength(newLength = undefined) {
    if (isEmulatedImmutable(this)) {
      throw TypeError('Cannot detach an immutable ArrayBuffer');
    }
    if (optTransferToFixedLength === undefined) {
      throw TypeError(
        'Cannot transferToFixedLength ArrayBuffer: underlying platform lacks ArrayBuffer.prototype.transferToFixedLength',
      );
    }
    return apply(optTransferToFixedLength, this, [newLength]);
  },
  /**
   * @this {ArrayBuffer}
   * @param {number} [newLength]
   */
  transferToImmutable(newLength = undefined) {
    if (isEmulatedImmutable(this)) {
      throw TypeError('Cannot detach an immutable ArrayBuffer');
    }
    // eslint-disable-next-line no-use-before-define
    if (optTransferBufferToImmutable === undefined) {
      throw TypeError(
        'Cannot transfer to immutable: underlying platform lacks transfer or structuredClone',
      );
    }
    // eslint-disable-next-line no-use-before-define
    return optTransferBufferToImmutable(this, newLength);
  },
};

// Better fidelity emulation of a class prototype: each property is
// non-enumerable, matching the shape `ArrayBuffer.prototype` itself uses.
for (const key of ownKeys(immutableArrayBufferLibProperties)) {
  defineProperty(immutableArrayBufferLibProperties, key, {
    enumerable: false,
  });
}
freeze(immutableArrayBufferLibProperties);

// Internal-test export. The helper itself is load-bearing for every
// method on `immutableArrayBufferLibProperties`, but the package's
// public export surface intentionally keeps it private (callers either
// touch the helper indirectly through `ArrayBuffer.prototype` methods
// or rely on `isBufferImmutable`). The export exists so the
// adversarial-tests skill can exercise the helper in isolation.
export { amplifyArrayBuffer as _amplifyArrayBufferForTests };

/**
 * Emulates what would have been the encapsulated `ImmutableArrayBufferInternal`
 * class constructor. This function takes the `realBuffer` which its
 * result encapsulates. Security demands that this result has exclusive access
 * to the `realBuffer` it is given, which its callers must ensure.
 *
 * The emulated immutable buffer directly inherits from `ArrayBuffer.prototype`.
 * The brand WeakMap is the sole discriminator: `ArrayBuffer.prototype`'s
 * methods (after the shim installs the lib properties) check brand membership
 * to decide whether to treat the receiver as immutable.
 *
 * @param {ArrayBuffer} realBuffer
 * @returns {ArrayBuffer}
 */
const makeImmutableArrayBufferInternal = realBuffer => {
  const result = /** @type {ArrayBuffer} */ (
    /** @type {unknown} */ ({
      __proto__: arrayBufferPrototype,
    })
  );
  // Install `[Symbol.toStringTag] = 'ImmutableArrayBuffer'` as an own
  // property of each emulated immutable buffer (not on the shared prototype,
  // which must retain the genuine `'ArrayBuffer'` tag so genuine instances
  // continue to read as `[object ArrayBuffer]`). This is the minimum
  // departure from DESIGN.md Move 2 paragraph 7 needed to keep
  // `concordance` (and any downstream consumer that sniffs the toStringTag)
  // from misrouting an emulated immutable through `Buffer.from`, which
  // throws because the emulated immutable is not a genuine exotic. With the
  // own-property slot in place, `Object.prototype.toString.call(immuAB)`
  // returns `'[object ImmutableArrayBuffer]'` and concordance routes the
  // value through its unrenderable-value path. Genuine ArrayBuffers
  // continue to inherit `'ArrayBuffer'` from the prototype.
  defineProperty(result, Symbol.toStringTag, {
    value: 'ImmutableArrayBuffer',
    writable: false,
    enumerable: false,
    configurable: false,
  });
  apply(weakmapSet, buffers, [result, realBuffer]);
  return result;
};
// Since `makeImmutableArrayBufferInternal` MUST not escape,
// this `freeze` is just belt-and-suspenders.
freeze(makeImmutableArrayBufferInternal);

/**
 * Internal brand check. Returns `true` when `buffer` is an emulated
 * immutable buffer (in the lib's brand WeakMap), `false` otherwise. After
 * the premise-2 fold-in the package no longer exports this from a public
 * entry point; callers use `buffer.immutable` (the accessor installed by
 * the shim on `ArrayBuffer.prototype`) or `Object.prototype.toString
 * .call(buffer) === '[object ImmutableArrayBuffer]'`. The internal export
 * lets the in-package tests (`test/lib-*.test.js`) reach the helper
 * directly without round-tripping through the prototype.
 *
 * @param {ArrayBuffer} buffer
 * @returns {boolean}
 */
export const isBufferImmutable = buffer => isEmulatedImmutable(buffer);

/**
 * Creates an immutable slice of the given buffer. Internal helper used by
 * `immutableArrayBufferLibProperties.sliceToImmutable` and by the shim's
 * own install. After the premise-2 fold-in the package no longer exports
 * this from a public entry point; the internal export lets the in-package
 * tests reach it directly.
 *
 * @param {ArrayBuffer} buffer The original buffer.
 * @param {number} [start] The start index.
 * @param {number} [end] The end index.
 * @returns {ArrayBuffer} The sliced immutable ArrayBuffer.
 */
export const sliceBufferToImmutable = (
  buffer,
  start = undefined,
  end = undefined,
) => {
  let realBuffer = apply(weakmapGet, buffers, [buffer]);
  if (realBuffer === undefined) {
    realBuffer = buffer;
  }
  return makeImmutableArrayBufferInternal(
    arrayBufferSlice(realBuffer, start, end),
  );
};

let transferBufferToImmutable;
if (optArrayBufferTransfer) {
  /**
   * Transfer the contents to a new Immutable ArrayBuffer. Internal helper
   * used by `immutableArrayBufferLibProperties.transferToImmutable` and by
   * the shim's own install. Not part of the package's public export surface.
   *
   * @param {ArrayBuffer} buffer The original buffer.
   * @param {number} [newLength] The start index.
   * @returns {ArrayBuffer}
   */
  transferBufferToImmutable = (buffer, newLength = undefined) => {
    if (newLength === undefined) {
      buffer = optArrayBufferTransfer(buffer);
    } else if (optTransfer) {
      buffer = apply(optTransfer, buffer, [newLength]);
    } else {
      buffer = optArrayBufferTransfer(buffer);
      const oldLength = buffer.byteLength;
      // eslint-disable-next-line @endo/restrict-comparison-operands
      if (newLength <= oldLength) {
        buffer = arrayBufferSlice(buffer, 0, newLength);
      } else {
        const oldTA = new Uint8Array(buffer);
        const newTA = new Uint8Array(newLength);
        apply(uint8ArraySet, newTA, [oldTA]);
        buffer = apply(uint8ArrayBuffer, newTA, []);
      }
    }
    const result = makeImmutableArrayBufferInternal(buffer);
    return /** @type {ArrayBuffer} */ (/** @type {unknown} */ (result));
  };
} else {
  transferBufferToImmutable = undefined;
}

export const optTransferBufferToImmutable = transferBufferToImmutable;
