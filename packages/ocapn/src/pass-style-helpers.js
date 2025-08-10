import { PASS_STYLE } from '@endo/pass-style';

const { freeze, prototype: ObjectPrototype, create } = Object;

/**
 * @param {string} tagName
 * @param {any} payload
 * @returns {any}
 * TODO: to be replaced by makeTagged from @endo/pass-style when it supports
 * OCapN selectors in the payload.
 */
export const makeTagged = (tagName, payload) => {
  const result = create(ObjectPrototype, {
    [PASS_STYLE]: { value: 'tagged' },
    [Symbol.toStringTag]: { value: tagName },
    payload: { value: payload, enumerable: true },
  });
  return freeze(result);
};

/**
 * @param {string} tagName
 * @returns {any}
 * TODO: to be replaced by makeSelector from @endo/pass-style when implemented.
 */
export const makeSelector = tagName => {
  const result = create(ObjectPrototype, {
    [PASS_STYLE]: { value: 'selector' },
    [Symbol.toStringTag]: { value: tagName },
  });
  return freeze(result);
};

/**
 * @param {any} selector
 * @returns {string}
 */
export const getSelectorName = selector => {
  if (selector[PASS_STYLE] !== 'selector') {
    throw Error(`Selector expected, got ${typeof selector}`);
  }
  return selector[Symbol.toStringTag];
};

/**
 * @param {any} value
 * @returns {'tagged' | 'selector' | 'unknown'}
 * TODO: to be replaced by passStyleOf from @endo/pass-style when it supports
 * OCapN "selector" pass style.
 */
export const passStyleOf = value => value[PASS_STYLE] || 'unknown';

/**
 * @param {Uint8Array} bytes
 * @returns {ArrayBuffer}
 */
export const makeByteArray = bytes => {
  if (!(bytes instanceof Uint8Array)) {
    throw Error(`Expected Uint8Array, got ${typeof bytes}`);
  }
  return /** @type {ArrayBuffer} */ (ArrayBuffer.prototype.slice.call(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ));
};

/**
 * @param {ArrayBuffer} buffer
 * @returns {Uint8Array}
 */
export const makeUint8ArrayFromByteArray = buffer => {
  if (!(buffer instanceof ArrayBuffer)) {
    throw Error(`Expected ArrayBuffer, got ${typeof buffer}`);
  }
  return new Uint8Array(buffer);
};

/**
 * @param {any} value
 * @returns {boolean}
 */
export const isByteArray = value => {
  return value instanceof ArrayBuffer;
};
