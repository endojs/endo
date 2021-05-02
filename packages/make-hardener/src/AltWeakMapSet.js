/* eslint-disable max-classes-per-file */
class ReturnOverrider {
  constructor(key) {
    return key;
  }
}

const OriginalWeakMap = WeakMap;
const OriginalWeakSet = WeakSet;

// Must not escape
const PUMPKIN = Object.freeze({ __proto__: null });

/**
 * @type {typeof WeakMap}
 */
class AltWeakMap {
  #hiddenClass;

  constructor(optIterable = undefined) {
    class HiddenClass extends ReturnOverrider {
      #value;

      constructor(key, value) {
        if (key !== Object(key)) {
          throw new TypeError(
            `Invalid value used as weak map key ${String(key)}`,
          );
        }
        super(key);
        this.#value = value;
      }

      static has(key) {
        try {
          return key.#value !== PUMPKIN;
        } catch (_err) {
          return false;
        }
      }

      static get(key) {
        try {
          return key.#value === PUMPKIN ? undefined : key.#value;
        } catch (_err) {
          return undefined;
        }
      }

      static set(key, value) {
        try {
          key.#value = value;
        } catch (_err) {
          // eslint-disable-next-line no-new
          new HiddenClass(key, value);
        }
      }

      static delete(key) {
        try {
          if (key.#value === PUMPKIN) {
            return false;
          }
          key.#value = PUMPKIN;
          return true;
        } catch (_err) {
          return false;
        }
      }
    }
    this.#hiddenClass = HiddenClass;
    if (optIterable) {
      for (const [k, v] of optIterable) {
        this.set(k, v);
      }
    }
  }

  has(key) {
    return this.#hiddenClass.has(key);
  }

  get(key) {
    return this.#hiddenClass.get(key);
  }

  set(key, value) {
    this.#hiddenClass.set(key, value);
    return this;
  }

  delete(key) {
    return this.#hiddenClass.delete(key);
  }
}

Object.defineProperty(AltWeakMap, Symbol.toStringTag, {
  value: 'WeakMap',
  writable: false,
  enumerable: false,
  configurable: true,
});

/**
 * @type {typeof WeakSet}
 */
class AltWeakSet {
  #wm = new AltWeakMap();

  constructor(optIterable = undefined) {
    if (optIterable) {
      for (const k of optIterable) {
        this.add(k);
      }
    }
  }

  has(key) {
    return this.#wm.has(key);
  }

  add(key) {
    this.#wm.set(key, true);
    return this;
  }

  delete(key) {
    return this.#wm.delete(key);
  }
}

Object.defineProperty(AltWeakMap, Symbol.toStringTag, {
  value: 'WeakMap',
  writable: false,
  enumerable: false,
  configurable: true,
});

export { OriginalWeakMap, OriginalWeakSet, AltWeakMap, AltWeakSet };
