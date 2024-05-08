// @ts-nocheck
/// <refs types="../types.js"/>

import '../src/assert-shim.js';
import '../src/console-shim.js';
import { repairIntrinsics } from '../src/lockdown.js';

import {
  makeCompartmentConstructor as makeShimCompartmentConstructor,
  compartmentOptions,
} from '../src/compartment.js';
import {
  TypeError,
  FERAL_EVAL,
  Map,
  Object,
  WeakMap,
  arrayMap,
  create,
  defineProperty,
  entries,
  freeze,
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
import { tameFunctionToString } from '../src/tame-function-tostring.js';
import { getGlobalIntrinsics } from '../src/intrinsics.js';

const ShimCompartment = makeShimCompartmentConstructor(
  makeShimCompartmentConstructor,
  getGlobalIntrinsics(globalThis),
  tameFunctionToString(),
);

const NativeCompartment = globalThis.Compartment;

const nativeCompartmentPrototype = NativeCompartment.prototype;
const shimCompartmentPrototype = ShimCompartment.prototype;

const nativeEvaluate = uncurryThis(nativeCompartmentPrototype.evaluate);
const nativeImport = uncurryThis(nativeCompartmentPrototype.import);
const nativeImportNow = uncurryThis(nativeCompartmentPrototype.importNow);

const shimEvaluate = uncurryThis(shimCompartmentPrototype.evaluate);
const shimImport = uncurryThis(shimCompartmentPrototype.import);
const shimImportNow = uncurryThis(shimCompartmentPrototype.importNow);

const nativeGetGlobalThis = uncurryThis(
  getOwnPropertyDescriptor(NativeCompartment.prototype, 'globalThis').get,
);
const shimGetGlobalThis = uncurryThis(
  getOwnPropertyDescriptor(ShimCompartment.prototype, 'globalThis').get,
);

const privateFields = new WeakMap();

const adapterFunctions = {
  evaluate(source, options) {
    const fields = weakmapGet(privateFields, this);
    if (fields === undefined) {
      throw new TypeError('this is not a compartment');
    }
    const { transforms, delegateNative, nativeEval } = fields;
    for (const transform of transforms) {
      source = transform(source);
    }
    if (delegateNative) {
      return nativeEval(source);
    } else {
      return shimEvaluate(source, options);
    }
  },

  async import(specifier) {
    await null;
    const fields = weakmapGet(privateFields, this);
    if (fields === undefined) {
      throw new TypeError('this is not a compartment');
    }
    const { noNamespaceBox, delegateNative } = fields;
    const delegateImport = delegateNative ? nativeImport : shimImport;
    const namespace = delegateImport(this, specifier);
    return noNamespaceBox ? namespace : { namespace: await namespace };
  },

  importNow(specifier) {
    const fields = weakmapGet(privateFields, this);
    if (fields === undefined) {
      throw new TypeError('this is not a compartment');
    }
    const { delegateNative } = fields;
    const delegateImportNow = delegateNative ? nativeImportNow : shimImportNow;
    return delegateImportNow(this, specifier);
  },
};

defineProperty(NativeCompartment.prototype, 'evaluate', {
  value: adapterFunctions.evaluate,
  writable: true,
  configurable: true,
  enumerable: false,
});

defineProperty(NativeCompartment.prototype, 'import', {
  value: adapterFunctions.import,
  writable: true,
  configurable: true,
  enumerable: false,
});

defineProperty(NativeCompartment.prototype, 'importNow', {
  value: adapterFunctions.importNow,
  writable: true,
  configurable: true,
  enumerable: false,
});

defineProperty(NativeCompartment.prototype, 'globalThis', {
  get() {
    const fields = weakmapGet(privateFields, this);
    if (fields === undefined) {
      throw new TypeError('this is not a compartment');
    }
    const { delegateNative } = fields;
    const delegateGetGlobalThis = delegateNative
      ? nativeGetGlobalThis
      : shimGetGlobalThis;
    return delegateGetGlobalThis(this);
  },
  configurable: true,
  enumerable: false,
});

defineProperty(NativeCompartment.prototype, 'name', {
  get() {
    const fields = weakmapGet(privateFields, this);
    if (fields === undefined) {
      throw new TypeError('this is not a compartment');
    }
    const { name } = fields;
    return name;
  },
  configurable: true,
  enumerable: false,
});

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
    throw new SyntaxError(
      'XS native compartments do not support precompiled module sources',
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
    throw new TypeError('module descriptor must be an object');
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
        throw new TypeError(
          'Cannot construct forward reference module descriptor in module map',
        );
      }
      const { descriptors } = weakmapGet(privateFields, compartment);
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

const commons = {
  Map,
  TypeError,
  adaptModuleDescriptor,
  arrayMap,
  compartmentOptions,
  defineProperty,
  entries,
  fromEntries,
  mapDelete,
  mapGet,
  nativeEvaluate,
  nativeGetGlobalThis,
  privateFields,
  shimGetGlobalThis,
  uncurryThis,
  weakmapSet,
};

// This machinery allows us to replace the native Compartment with an adapter
// in the start compartment and any child compartment that the adapter begets.
const compartmentShim = `(
  compartmentShim,
  commons,
  NativeCompartment,
  ShimCompartment,
  maybeHarden,
) => {
  const {
    Map,
    TypeError,
    adaptModuleDescriptor,
    arrayMap,
    compartmentOptions,
    defineProperty,
    entries,
    fromEntries,
    mapDelete,
    mapGet,
    nativeEvaluate,
    nativeGetGlobalThis,
    privateFields,
    shimGetGlobalThis,
    uncurryThis,
    weakmapSet,
  } = commons;

  function Compartment(...args) {
    const options = compartmentOptions(...args);

    const {
      name = undefined,
      globals = {},
      transforms = [],
      resolveHook = () => {
        throw new TypeError('Compartment requires a resolveHook');
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
            ([specifier, descriptor]) => [
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

    const ChildCompartment = nativeEvaluate(compartment, compartmentShim)(
      compartmentShim,
      commons,
      nativeGlobalThis.Compartment,
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

  return maybeHarden(Compartment);
};`;

// Adapt the start compartment's native Compartment to the SES-compatibility
// adapter.
// Before Lockdown, the Compartment constructor in transitive child
// Compartments is not (and cannot be) hardened.
const noHarden = object => object;
globalThis.Compartment = FERAL_EVAL(compartmentShim)(
  compartmentShim,
  commons,
  NativeCompartment,
  ShimCompartment,
  noHarden,
);

globalThis.lockdown = options => {
  const hardenIntrinsics = repairIntrinsics(options);
  hardenIntrinsics();
  // Replace global Compartment with a version that is hardened and hardens
  // transitive child Compartment.
  globalThis.Compartment = FERAL_EVAL(compartmentShim)(
    compartmentShim,
    commons,
    NativeCompartment,
    ShimCompartment,
    harden,
  );
};

// XS Object.freeze takes a second argument to apply freeze transitively, but
// with slightly different effects than `harden`.
// We disable this behavior to encourage use of `harden` for portable Hardened
// JavaScript.
/** @param {object} object */
Object.freeze = object => freeze(object);
