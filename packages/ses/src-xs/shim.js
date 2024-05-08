// @ts-nocheck
/// <refs types="../types.js"/>

const NativeCompartment = globalThis.Compartment;
const nativeLockdown = globalThis.lockdown;
const nativeFreeze = Object.freeze;

// This machinery allows us to replace the native Compartment with an adapter
// in the start compartment and any child compartment that the adapter begets.
const compartmentShim = `(NativeCompartment, compartmentShim, maybeHarden) => {

  const compartmentOptions = (...args) => {
    if (args.length === 0) {
      return {};
    }
    if (
      args.length === 1 &&
      Object(args[0]) === args[0] &&
      '__options__' in args[0]
    ) {
      const { __options__, ...options } = args[0];
      if (__options__ !== true) {
        throw new Error('Compartment constructor only supports true __options__ sigil, got ' + __options__);
      }
      return options;
    } else {
      const [
        globals,
        modules,
        options,
      ] = args;
      if (args.length === 1 && Object(globals) !== globals) {
        throw new TypeError('Compartment must receive an object for options or globals');
      }
      if (Object(options) === options) {
        if ('modules' in options) {
          throw new TypeError('Compartment constructor must receive either a module map argument or modules option, not both');
        }
        if ('globals' in options) {
          throw new TypeError('Compartment constructor must receive either globals argument or option, not both');
        }
      }
      return {
        ...(options ?? {}),
        globals: globals ?? {},
        modules: modules ?? {},
      };
    }
  };

  const adaptVirtualSource = ({
    execute,
    imports = [],
    exports = [],
    reexports = [],
  }) => {
    const resolutions = Object.create(null);
    let i = 0;
    return {
      execute(environment) {
        const fakeCompartment = {
          importNow(specifier) {
            return environment[specifier];
          },
        };
        execute(environment, fakeCompartment, resolutions);
      },
      bindings: [
        ...imports.map(specifier => {
          const resolved = '_' + i++;
          resolutions[specifier] = resolved;
          return { importAllFrom: specifier, as: resolved };
        }),
        ...reexports.map(specifier => ({ exportAllFrom: specifier })),
        ...exports.map(name => ({ export: name })),
      ],
    };
  };

  const adaptSource = source => {
    if (source.execute) {
      return adaptVirtualSource(source);
    }
    return source;
  };

  class Compartment {
    #name;
    #transforms;
    #native;
    #descriptors;
    #noNamespaceBox;

    #adaptDescriptor(descriptor, specifier) {
      if (Object(descriptor) !== descriptor) {
        throw new Error('module descriptor must be an object');
      }
      // Pass through, translating compartments to their native equivalents:
      if (descriptor.namespace !== undefined) {
        return {
          namespace: descriptor.namespace,
          compartment: descriptor.compartment?.#native,
        };
      }
      if (descriptor.source !== undefined) {
        return {
          source: descriptor.source,
          importMeta: descriptor.importMeta,
          specifier: descriptor.specifier,
        };
      }
      // Legacy support for record descriptors.
      if (descriptor.record !== undefined) {
        if (
          descriptor.specifier === specifier ||
          descriptor.specifier === undefined
        ) {
          return {
            source: adaptSource(descriptor.record),
            specifier,
            // Legacy descriptors do not support importMeta.
          };
        } else {
          this.#descriptors.set(descriptor.specifier, {
            compartment: this,
            namespace: specifier,
          });
          return {
            source: adaptSource(descriptor.record),
            specifier: descriptor.specifier,
          };
        }
      }
      if (descriptor.specifier !== undefined) {
        return {
          namespace: descriptor.specifier,
          compartment: descriptor.compartment?.#native,
        };
      }
      // Legacy support for a source in the place of a descriptor.
      return { source: adaptSource(descriptor) };
    }

    constructor(...args) {
      const options = compartmentOptions(...args);

      if ('globals' in options && Object(options.globals) !== options.globals) {
        throw new TypeError('Compartment globals must be an object if specified');
      }
      if ('modules' in options && Object(options.modules) !== options.modules) {
        throw new TypeError('Compartment modules must be an object if specified');
      }
      if ('resolveHook' in options && typeof options.resolveHook !== 'function') {
        throw new TypeError(
          'Compartment resolveHook must be a function if specified',
        );
      }
      if ('importHook' in options && typeof options.importHook !== 'function') {
        throw new TypeError(
          'Compartment importHook must be a function if specified',
        );
      }
      if (
        'importNowHook' in options &&
        typeof options.importNowHook !== 'function'
      ) {
        throw new TypeError(
          'Compartment importNowHook must be a function if specified',
        );
      }
      if ('loadHook' in options && typeof options.loadHook !== 'function') {
        throw new TypeError(
          'Compartment loadHook must be a function if specified',
        );
      }
      if ('loadNowHook' in options && typeof options.loadNowHook !== 'function') {
        throw new TypeError(
          'Compartment loadNowHook must be a function if specified',
        );
      }
      if (
        'moduleMapHook' in options &&
        typeof options.moduleMapHook !== 'function'
      ) {
        throw new TypeError(
          'Compartment moduleMapHook must be a function if specified',
        );
      }

      let {
        name = undefined,
        globals = {},
        transforms = [],
        resolveHook = () => {
          throw new Error('Compartment requires a resolveHook');
        },
        loadHook = undefined,
        loadNowHook = undefined,
        importHook = loadHook,
        importNowHook = loadNowHook,
        moduleMapHook = () => {},
        __noNamespaceBox__: noNamespaceBox = false,
      } = options;
      this.#name = name;
      this.#transforms = transforms;
      this.#descriptors = new Map();
      this.#noNamespaceBox = noNamespaceBox;

      const modules = Object.fromEntries(
        Object.entries(options.modules ?? {}).map(([specifier, descriptor]) => [
          specifier,
          this.#adaptDescriptor(descriptor, specifier),
        ]),
      );

      let nativeOptions = { globals, modules };

      if (importHook) {
        nativeOptions = {
          ...options,
          resolveHook,
          /** @param {string} specifier */
          loadHook: async specifier => {
            let descriptor =
              this.#descriptors.get(specifier) ??
              moduleMapHook(specifier) ??
              (await importHook(specifier));
            this.#descriptors.delete(specifier);
            descriptor = this.#adaptDescriptor(descriptor, specifier);
            return descriptor;
          },
        };
      }

      if (importNowHook) {
        nativeOptions = {
          ...options,
          resolveHook,
          /** @param {string} specifier */
          loadNowHook: specifier => {
            let descriptor =
              this.#descriptors.get(specifier) ??
              moduleMapHook(specifier) ??
              importNowHook(specifier);
            this.#descriptors.delete(specifier);
            descriptor = this.#adaptDescriptor(descriptor, specifier);
            return descriptor;
          },
        };
      }

      this.#native = new NativeCompartment(nativeOptions);
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
    async import(specifier) {
      if (this.#noNamespaceBox) {
        return this.#native.import(specifier);
      }
      return { namespace: await this.#native.import(specifier) };
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

  Object.defineProperty(Compartment.prototype, Symbol.toStringTag, {
    value: 'Compartment',
    writable: true,
    enumerable: false,
    configurable: true,
  });

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

/** @import {LockdownOptions} from '../types.js' */

/**
 * @param {LockdownOptions} options
 */
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
