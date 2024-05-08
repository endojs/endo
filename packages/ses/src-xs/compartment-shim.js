/**
 * @module Provides a XS-specific variation on the behavior of
 * ../compartment-shim.js, completing the story that begins in
 * ./compartment.js, adding a Compartment constructor adapter to the global
 * scope and transforming all of the methods of a native compartment into
 * thunks that will alternately delegate to its native or shim behaviors
 * depending on the __native__ Compartment constructor option.
 */

/// <reference types="ses"/>

import { defineProperty, globalThis, weakmapGet } from '../src/commons.js';
import {
  NativeStartCompartment,
  nativeCompartmentPrototype,
  nativeImport,
  nativeImportNow,
  nativeEvaluate,
  nativeGetGlobalThis,
} from './commons.js';
import {
  ShimStartCompartment,
  adaptCompartmentConstructors,
  privateFields,
  shimEvaluate,
  shimGetGlobalThis,
  shimImport,
  shimImportNow,
} from './compartment.js';

const adapterFunctions = {
  evaluate(source, options) {
    const fields = weakmapGet(privateFields, this);
    if (fields === undefined) {
      return nativeEvaluate(this, source);
    }
    const { delegateNative } = fields;
    if (delegateNative) {
      const { transforms, nativeEval } = fields;
      for (let i = 0; i < transforms.length; i += 1) {
        const transform = transforms[i];
        source = transform(source);
      }
      return nativeEval(source);
    } else {
      return shimEvaluate(this, source, options);
    }
  },

  async import(specifier) {
    await null;
    const fields = weakmapGet(privateFields, this);
    if (fields === undefined) {
      return nativeImport(this, specifier);
    }
    const { noNamespaceBox, delegateNative } = fields;
    const delegateImport = delegateNative ? nativeImport : shimImport;
    const namespace = delegateImport(this, specifier);
    return noNamespaceBox ? namespace : { namespace: await namespace };
  },

  importNow(specifier) {
    const fields = weakmapGet(privateFields, this);
    if (fields === undefined) {
      return nativeImportNow(this, specifier);
    }
    const { delegateNative } = fields;
    const delegateImportNow = delegateNative ? nativeImportNow : shimImportNow;
    return delegateImportNow(this, specifier);
  },
};

defineProperty(nativeCompartmentPrototype, 'evaluate', {
  value: adapterFunctions.evaluate,
  writable: true,
  configurable: true,
  enumerable: false,
});

defineProperty(nativeCompartmentPrototype, 'import', {
  value: adapterFunctions.import,
  writable: true,
  configurable: true,
  enumerable: false,
});

defineProperty(nativeCompartmentPrototype, 'importNow', {
  value: adapterFunctions.importNow,
  writable: true,
  configurable: true,
  enumerable: false,
});

defineProperty(nativeCompartmentPrototype, 'globalThis', {
  get() {
    const fields = weakmapGet(privateFields, this);
    if (fields === undefined) {
      return nativeGetGlobalThis(this);
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

defineProperty(nativeCompartmentPrototype, 'name', {
  get() {
    const fields = weakmapGet(privateFields, this);
    if (fields === undefined) {
      return undefined;
    }
    const { name } = fields;
    return name;
  },
  configurable: true,
  enumerable: false,
});

// Adapt the start compartment's native Compartment to the SES-compatibility
// adapter.
// Before Lockdown, the Compartment constructor in transitive child
// Compartments is not (and cannot be) hardened.
const noHarden = object => object;
// @ts-expect-error TypeScript is not inferring from the types above that
// Compartment is on globalThis.
globalThis.Compartment = adaptCompartmentConstructors(
  NativeStartCompartment,
  ShimStartCompartment,
  noHarden,
);
