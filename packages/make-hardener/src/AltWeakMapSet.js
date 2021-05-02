// This idea is due to Kevin Smith (@zenparsing). I redid it only because
// I could not find his implementation. Now that it's done, I'd be interested
// in comparing.

const OriginalWeakMap = WeakMap;
const OriginalWeakSet = WeakSet;

// Put what should have been the source of this module into a big literal
// string which we evaluate, to workaround our tooling situation where
// our version of rollup uses a version of acorn that doesn't understand
// class private field syntax.
const AltWeakMapSetSrc = `

/* eslint-disable max-classes-per-file */
class ReturnOverrider {
  constructor(key) {
    return key;
  }
}

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
            // eslint-disable-next-line prefer-template
            'Invalid value used as weak map key ' + String(key),
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

return ({ AltWeakMap, AltWeakSet });
`;

let func;
try {
  // eslint-disable-next-line no-new-func
  func = new Function(AltWeakMapSetSrc);
} catch (err) {
  if (err instanceof SyntaxError) {
    // In case we're on a platform (like Node 10) that does not understand the
    // new class-private-field syntax, `#`, the following call to the `Function`
    // constructor will throw a `SyntaxError`. We use the `Function` constructor
    // rather than `eval` so we can distinguish a syntax error in this code vs
    // any error this code might throw once it is actually executed.
    // If we're on such a platform, then we just report the original weakmap
    // and weakset are the alt ones, since we cannot replace them anyway.
    func = () => ({ AltWeakMap: OriginalWeakMap, AltWeakSet: OriginalWeakSet });
  } else {
    throw err;
  }
}

const {
  /**
   * @type {typeof WeakMap}
   */
  AltWeakMap,
  /**
   * @type {typeof WeakSet}
   */
  AltWeakSet,
  // eslint-disable-next-line no-eval
} = func();

export { OriginalWeakMap, OriginalWeakSet, AltWeakMap, AltWeakSet };
