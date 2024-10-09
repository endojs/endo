// @ts-nocheck
/// <refs types="../types.js"/>

import '../src/assert-shim.js';
import '../src/console-shim.js';

import {
  makeCompartmentConstructor as makeVirtualCompartmentConstructor,
  compartmentOptions,
} from '../src/compartment.js';
import {
  FERAL_EVAL,
  Object,
  create,
  defineProperty,
  entries,
  freeze,
  fromEntries,
  globalThis,
  toStringTagSymbol,
} from '../src/commons.js';
import { tameFunctionToString } from '../src/tame-function-tostring.js';
import { getGlobalIntrinsics } from '../src/intrinsics.js';

const VirtualCompartment = makeVirtualCompartmentConstructor(
  makeVirtualCompartmentConstructor,
  getGlobalIntrinsics(globalThis),
  tameFunctionToString(),
);

const NativeCompartment = globalThis.Compartment;
const nativeLockdown = globalThis.lockdown;

const commons = {
  Object,
  create,
  defineProperty,
  entries,
  freeze,
  fromEntries,
  toStringTagSymbol,
};

// This machinery allows us to replace the native Compartment with an adapter
// in the start compartment and any child compartment that the adapter begets.
const compartmentShim = `(
  compartmentShim,
  commons,
  NativeCompartment,
  VirtualCompartment,
  compartmentOptions,
  maybeHarden,
) => {

  const {
    Object,
    create,
    defineProperty,
    entries,
    freeze,
    fromEntries,
    toStringTagSymbol,
  } = commons;

  const adaptVirtualModuleSource = ({
    execute,
    imports = [],
    exports = [],
    reexports = [],
  }) => {
    const resolutions = create(null);
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

  const adaptModuleSource = source => {
    if (source.execute) {
      return adaptVirtualModuleSource(source);
    }
    if (source.__syncModuleProgram__) {
      return undefined;
    }
    return source;
  };

  class Compartment {
    #name;
    #transforms;
    #native;
    #virtual;
    #delegate;
    #eval;
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
          source: adaptModuleSource(descriptor.source),
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
            source: adaptModuleSource(descriptor.record),
            specifier,
            // Legacy descriptors do not support importMeta.
          };
        } else {
          this.#descriptors.set(descriptor.specifier, {
            compartment: this,
            namespace: specifier,
          });
          return {
            source: adaptModuleSource(descriptor.record),
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
      return { source: adaptModuleSource(descriptor) };
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

      const modules = fromEntries(
        entries(options.modules ?? {}).map(([specifier, descriptor]) => [
          specifier,
          this.#adaptDescriptor(descriptor, specifier),
        ]),
      );

      const virtualOptions = {
        ...options,
        __noNamespaceBox__: true,
        __options__: true,
      };
      this.#virtual = new VirtualCompartment(virtualOptions);

      let nativeOptions = { globals, modules };

      if (importHook) {
        /** @param {string} specifier */
        const nativeImportHook = async specifier => {
          let descriptor =
            this.#descriptors.get(specifier) ??
            moduleMapHook(specifier) ??
            (await importHook(specifier));
          this.#descriptors.delete(specifier);
          descriptor = this.#adaptDescriptor(descriptor, specifier);
          return descriptor;
        };
        nativeOptions = {
          ...nativeOptions,
          resolveHook,
          importHook: nativeImportHook,
          loadHook: nativeImportHook,
        };
      }

      if (importNowHook) {
        /** @param {string} specifier */
        const nativeImportNowHook = specifier => {
          let descriptor =
            this.#descriptors.get(specifier) ??
            moduleMapHook(specifier) ??
            importNowHook(specifier);
          this.#descriptors.delete(specifier);
          descriptor = this.#adaptDescriptor(descriptor, specifier);
          return descriptor;
        };
        nativeOptions = {
          ...nativeOptions,
          resolveHook,
          importNowHook: nativeImportNowHook,
          loadNowHook: nativeImportNowHook,
        };
      }

      this.#native = new NativeCompartment(nativeOptions);

      this.#delegate = options.__native__ ? this.#native : this.#virtual;
      this.#eval = options.__native__ ?
        this.#native.globalThis.eval :
        this.#virtual.evaluate.bind(this.#virtual);

      const ChildCompartment = this.#native.evaluate(compartmentShim)(
        compartmentShim,
        commons,
        this.#native.globalThis.Compartment,
        this.#virtual.globalThis.Compartment,
        compartmentOptions,
        maybeHarden,
      );

      defineProperty(this.#native.globalThis, 'Compartment', {
        value: ChildCompartment,
        writable: true,
        configurable: true,
        enumerable: false,
      });
      defineProperty(this.#virtual.globalThis, 'Compartment', {
        value: ChildCompartment,
        writable: true,
        configurable: true,
        enumerable: false,
      });

      maybeHarden(this);
    }

    /** @param {string} specifier */
    async import(specifier) {
      if (this.#noNamespaceBox) {
        return this.#delegate.import(specifier);
      }
      return { namespace: await this.#delegate.import(specifier) };
    }

    /** @param {string} specifier */
    importNow(specifier) {
      return this.#delegate.importNow(specifier);
    }

    /** @param {string} source */
    evaluate(source, options) {
      for (const transform of this.#transforms) {
        source = transform(source);
      }
      return this.#eval(source, options);
    }

    get globalThis() {
      return this.#delegate.globalThis;
    }

    get name() {
      return this.#name;
    }
  }

  defineProperty(Compartment.prototype, toStringTagSymbol, {
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
globalThis.Compartment = FERAL_EVAL(compartmentShim)(
  compartmentShim,
  commons,
  NativeCompartment,
  VirtualCompartment,
  compartmentOptions,
  noHarden,
);

globalThis.lockdown = () => {
  nativeLockdown();
  // Replace global Compartment with a version that is hardened and hardens
  // transitive child Compartment.
  globalThis.Compartment = FERAL_EVAL(compartmentShim)(
    compartmentShim,
    commons,
    NativeCompartment,
    VirtualCompartment,
    compartmentOptions,
    harden,
  );
};

// XS Object.freeze takes a second argument to apply freeze transitively, but
// with slightly different effects than `harden`.
// We disable this behavior to encourage use of `harden` for portable Hardened
// JavaScript.
/** @param {object} object */
Object.freeze = object => freeze(object);
