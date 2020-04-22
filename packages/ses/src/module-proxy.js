// Compartments need a mechanism to link a module from one compartment
// to another.
// The procedure is to use `compartment.module(specifier)` to obtain
// the module exports namespace from one compartment before loading,
// linking, or executing that module, and threading it into the module map of
// another compartment.
// For this to be possible, it is necessary to model the module exports
// namespace as a proxy that will treat all access to those exports as
// reference errors until the properties of the actual module are known.
// This module provides the mechanism for modeling the public module namespace
// and eventually connecting it to to the actual module namespace.
import { immutableObject } from './commons.js';
import { makeAlias } from './module-load.js';

const { freeze } = Object;
// q, as in quote, for error messages.
const q = JSON.stringify;

// `createDeferredModule` creates a `ModuleNamespace` proxy and reifier.
// A `Compartment` can create a `ModuleNamespace` for any hypothetical module
// and use that object as a token that can be fed into another compartment's
// module map.
// Only when the module has been loaded, analyzed, and instantiated does it
// become possible to distinguish properties that correspond to module exports.
const createDeferredModule = () => {
  let internalModule = null;
  return freeze({
    activate(module) {
      internalModule = module;
    },
    module: new Proxy(immutableObject, {
      get(ignore, name, target) {
        if (internalModule == null) {
          throw new ReferenceError(`binding ${q(name)} not yet initialized`);
        }
        return Reflect.get(internalModule, name, target);
      },
      set(ignore, name, value) {
        if (internalModule == null) {
          throw new ReferenceError(`binding ${q(name)} not yet initialized`);
        }
        if (!Reflect.set(internalModule, name, value)) {
          throw new TypeError(
            `Cannot add property ${name}, object is not extensible`,
          );
        }
      },
      ownKeys(target) {
        if (internalModule == null) {
          throw new ReferenceError(`module bindings are not yet initialized`);
        }
        return Reflect.ownKeys(target);
      },
    }),
  });
};

// `deferModule` memoizes the creation of a deferred module exports namespace
// for any abritrary full specifier in a compartment.
// It also records the compartment and specifier affiliated with that module
// exports namespace so it can be used as an alias into another compartment
// when threaded through a compartment's moduleMap argument.
export const deferModule = (
  compartment,
  compartmentPrivateFields,
  moduleAliases,
  specifier,
) => {
  const { deferredModules } = compartmentPrivateFields;
  if (!deferredModules.has(specifier)) {
    const deferred = createDeferredModule();
    moduleAliases.set(deferred.module, makeAlias(compartment, specifier));
    deferredModules.set(specifier, deferred);
  }
  return deferredModules.get(specifier);
};
