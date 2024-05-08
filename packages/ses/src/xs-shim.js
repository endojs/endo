import './assert-shim.js';

const NativeCompartment = globalThis.Compartment;
const nativeLockdown = globalThis.lockdown;
const nativeFreeze = Object.freeze;

// This machinery allows us to replace the native Compartment with an adapter
// in the start compartment and any child compartment that the adapter begets.
const compartmentShim = `(NativeCompartment, compartmentShim, maybeHarden) => {
  class Compartment {
    #name;
    #transforms;
    #native;

    #adaptDescriptor(descriptor) {
      if (
        descriptor.compartment !== undefined &&
        descriptor.specifier !== undefined
      ) {
        return {
          namespace: descriptor.specifier,
          compartment: descriptor.compartment.#native,
        };
      }
      return { source: descriptor };
    }

    constructor(
      globals = {},
      modules = {},
      {
        name = undefined,
        transforms = [],
        resolveHook = undefined,
        importHook = undefined,
        importNowHook = undefined,
        moduleMapHook = () => {},
      } = {},
    ) {
      this.#name = name;
      this.#transforms = transforms;

      modules = Object.fromEntries(
        Object.entries(modules).map(([specifier, descriptor]) => [
          specifier,
          this.#adaptDescriptor(descriptor),
        ]),
      );

      let options = { globals, modules };

      if (importHook) {
        options = {
          ...options,
          resolveHook,
          /** @param {string} specifier */
          loadHook: async specifier => {
            let descriptor = moduleMapHook(specifier);
            if (descriptor === undefined) {
              descriptor = await importHook(specifier);
            }
            return this.#adaptDescriptor(descriptor);
          },
        };
      }

      if (importNowHook) {
        options = {
          ...options,
          resolveHook,
          /** @param {string} specifier */
          loadNowHook: specifier => {
            let descriptor = moduleMapHook(specifier);
            if (descriptor === undefined) {
              descriptor = importNowHook(specifier);
            }
            return this.#adaptDescriptor(descriptor);
          },
        };
      }

      this.#native = new NativeCompartment(options);
      Object.defineProperty(this.#native.globalThis, 'Compartment', {
        value: this.#native.evaluate(compartmentShim)(
          this.#native.globalThis.Compartment,
          compartmentShim,
          maybeHarden,
        ),
        writable: true,
        configurable: true,
        enumerable: false,
      });

      maybeHarden(this);
    }

    /** @param {string} specifier */
    import(specifier) {
      return this.#native.import(specifier);
    }

    /** @param {string} specifier */
    importNow(specifier) {
      return this.#native.importNow(specifier);
    }

    /** @param {string} source */
    evaluate(source) {
      for (const transform of this.#transforms) {
        source = transform(source);
      }
      return this.#native.evaluate(source);
    }

    get globalThis() {
      return this.#native.globalThis;
    }

    get name() {
      return this.#name;
    }
  }

  return maybeHarden(Compartment);
}`;

// Adapt the start compartment's native Compartment to the SES-compatibility
// adapter.
// Before Lockdown, the Compartment constructor in transitive child
// Compartments is not (and cannot be) hardened.
const noHarden = object => object;
globalThis.Compartment = (0, eval)(compartmentShim)(
  NativeCompartment,
  compartmentShim,
  noHarden,
);

globalThis.lockdown = () => {
  nativeLockdown();
  // Replace global Compartment with a version that is hardened and hardens
  // transitive child Compartment.
  globalThis.Compartment = (0, eval)(compartmentShim)(
    NativeCompartment,
    compartmentShim,
    harden,
  );
};

// XS Object.freeze takes a second argument to apply freeze transitively, but
// with slightly different effects than `harden`.
// We disable this behavior to encourage use of `harden` for portable Hardened
// JavaScript.
/** @param {object} object */
Object.freeze = object => nativeFreeze(object);
