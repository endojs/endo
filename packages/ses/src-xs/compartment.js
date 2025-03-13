/* eslint-disable @endo/no-nullish-coalescing */

/** @import {ModuleDescriptor} from '../types.js' */

import {
  Map,
  Object,
  SyntaxError,
  TypeError,
  WeakMap,
  arrayMap,
  create,
  defineProperty,
  entries,
  fromEntries,
  getOwnPropertyDescriptor,
  globalThis,
  mapDelete,
  mapGet,
  mapSet,
  uncurryThis,
  weakmapGet,
  weakmapSet,
} from '../src/commons.js';
import { nativeGetGlobalThis } from './commons.js';
import {
  makeCompartmentConstructor,
  compartmentOptions,
} from '../src/compartment.js';
import { getGlobalIntrinsics } from '../src/intrinsics.js';
import { tameFunctionToString } from '../src/tame-function-tostring.js';
import { chooseReporter } from '../src/reporting.js';
import { makeError } from '../src/error/assert.js';

const muteReporter = chooseReporter('none');

export const ShimStartCompartment = makeCompartmentConstructor(
  makeCompartmentConstructor,
  getGlobalIntrinsics(globalThis, muteReporter),
  tameFunctionToString(),
);

export const shimCompartmentPrototype = ShimStartCompartment.prototype;

export const shimEvaluate = uncurryThis(shimCompartmentPrototype.evaluate);
export const shimImport = uncurryThis(shimCompartmentPrototype.import);
export const shimImportNow = uncurryThis(shimCompartmentPrototype.importNow);

/** @type {(compartment: typeof Compartment) => typeof globalThis} */
export const shimGetGlobalThis = uncurryThis(
  // @ts-expect-error The descriptor will never be undefined.
  getOwnPropertyDescriptor(ShimStartCompartment.prototype, 'globalThis').get,
);

/**
 * @typedef {{
 *   name: string,
 *   transforms: Array<(source: string) => string>,
 *   delegateNative: boolean,
 *   noNamespaceBox: boolean,
 *   nativeEval: typeof eval,
 *   descriptors: Map<string, ModuleDescriptor>,
 * }} PrivateFields
 */

/** @type {WeakMap<object, PrivateFields>} */
export const privateFields = new WeakMap();

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
      ...arrayMap(imports, specifier => {
        const resolved = `_${i}`;
        i += 1;
        resolutions[specifier] = resolved;
        return { importAllFrom: specifier, as: resolved };
      }),
      ...arrayMap(reexports, specifier => ({ exportAllFrom: specifier })),
      ...arrayMap(exports, name => ({ export: name })),
    ],
  };
};

const adaptModuleSource = source => {
  if (source.execute) {
    return adaptVirtualModuleSource(source);
  }
  // eslint-disable-next-line no-underscore-dangle
  if (source.__syncModuleProgram__) {
    throw makeError(
      'XS native compartments do not support precompiled module sources',
      SyntaxError,
    );
  }
  return source;
};

const adaptModuleDescriptor = (
  descriptor,
  specifier,
  compartment = undefined,
) => {
  if (Object(descriptor) !== descriptor) {
    throw makeError('Module descriptor must be an object', TypeError);
  }
  if (descriptor.namespace !== undefined) {
    return descriptor;
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
        importMeta: descriptor.importMeta,
      };
    } else {
      if (compartment === undefined) {
        throw makeError(
          'Cannot construct forward reference module descriptor in module map',
          TypeError,
        );
      }
      const compartmentPrivateFields = weakmapGet(privateFields, compartment);
      if (compartmentPrivateFields === undefined) {
        throw makeError(
          'Module descriptor compartment is not a recognizable compartment',
          TypeError,
        );
      }
      const { descriptors } = compartmentPrivateFields;
      mapSet(descriptors, descriptor.specifier, {
        compartment,
        namespace: specifier,
      });
      return {
        source: adaptModuleSource(descriptor.record),
        specifier: descriptor.specifier,
        importMeta: descriptor.importMeta,
      };
    }
  }
  if (descriptor.specifier !== undefined) {
    return {
      namespace: descriptor.specifier,
      compartment: descriptor.compartment,
    };
  }
  // Legacy support for a source in the place of a descriptor.
  return { source: adaptModuleSource(descriptor) };
};

export const adaptCompartmentConstructors = (
  NativeCompartment,
  ShimCompartment,
  maybeHarden,
) => {
  function Compartment(...args) {
    const options = compartmentOptions(...args);

    const {
      name = undefined,
      globals = {},
      transforms = [],
      resolveHook = () => {
        throw makeError('Compartment requires a resolveHook', TypeError);
      },
      loadHook = undefined,
      loadNowHook = undefined,
      importHook = loadHook,
      importNowHook = loadNowHook,
      moduleMapHook = () => {},
      __native__: delegateNative = false,
      __noNamespaceBox__: noNamespaceBox = false,
    } = options;

    const modules = delegateNative
      ? fromEntries(
          arrayMap(
            entries(options.modules ?? {}),
            // Uses desctructuring to avoid invoking iterator protocol and deny
            // vetted shims the opportunity to interfere.
            ({ 0: specifier, 1: descriptor }) => [
              specifier,
              adaptModuleDescriptor(descriptor, specifier, undefined),
            ],
          ),
        )
      : {};

    // side table for references from one descriptor to another
    const descriptors = new Map();

    let nativeOptions = { globals, modules };

    if (importHook) {
      /** @param {string} specifier */
      const nativeImportHook = async specifier => {
        await null;
        let descriptor =
          mapGet(descriptors, specifier) ??
          moduleMapHook(specifier) ??
          (await importHook(specifier));
        mapDelete(descriptors, specifier);
        // eslint-disable-next-line no-use-before-define
        descriptor = adaptModuleDescriptor(descriptor, specifier, compartment);
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
          mapGet(descriptors, specifier) ??
          moduleMapHook(specifier) ??
          importNowHook(specifier);
        mapDelete(descriptors, specifier);
        // eslint-disable-next-line no-use-before-define
        descriptor = adaptModuleDescriptor(descriptor, specifier, compartment);
        return descriptor;
      };
      nativeOptions = {
        ...nativeOptions,
        resolveHook,
        importNowHook: nativeImportNowHook,
        loadNowHook: nativeImportNowHook,
      };
    }

    const compartment = new NativeCompartment(nativeOptions);

    const nativeGlobalThis = nativeGetGlobalThis(compartment);

    const nativeEval = nativeGlobalThis.eval;

    weakmapSet(privateFields, compartment, {
      name,
      transforms,
      delegateNative,
      noNamespaceBox,
      nativeEval,
      descriptors,
    });

    const shimOptions = {
      ...options,
      __noNamespaceBox__: true,
      __options__: true,
    };

    uncurryThis(ShimCompartment)(compartment, shimOptions);

    const shimGlobalThis = shimGetGlobalThis(compartment);

    const ChildCompartment = adaptCompartmentConstructors(
      // @ts-expect-error incomplete type information for XS
      nativeGlobalThis.Compartment,
      // @ts-expect-error incomplete type information for XS
      shimGlobalThis.Compartment,
      maybeHarden,
    );

    defineProperty(nativeGlobalThis, 'Compartment', {
      value: ChildCompartment,
      writable: true,
      configurable: true,
      enumerable: false,
    });

    defineProperty(shimGlobalThis, 'Compartment', {
      value: ChildCompartment,
      writable: true,
      configurable: true,
      enumerable: false,
    });

    maybeHarden(compartment);
    return compartment;
  }

  maybeHarden(Compartment);
  return Compartment;
};
