import {
  functionPrototype,
  getPrototypeOf,
  globalThis,
  objectPrototype,
  setPrototypeOf,
} from './commons.js';

export const tameModuleSource = () => {
  const newIntrinsics = {};

  const ModuleSource = globalThis.ModuleSource;
  if (ModuleSource !== undefined) {
    newIntrinsics.ModuleSource = ModuleSource;

    // We introduce ModuleSource.[[Proto]] === AbstractModuleSource
    // and ModuleSource.prototype.[[Proto]] === AbstractModuleSource.prototype
    // if that layer is absent because the permitting system can more
    // gracefully tolerate the absence of an expected prototype than the
    // presence of an unexpected prototype,.
    function AbstractModuleSource() {
      // no-op safe to super()
    }

    const ModuleSourceProto = getPrototypeOf(ModuleSource);
    if (ModuleSourceProto === functionPrototype) {
      setPrototypeOf(ModuleSource, AbstractModuleSource);
      newIntrinsics['%AbstractModuleSource%'] = AbstractModuleSource;
      newIntrinsics['%AbstractModuleSourcePrototype%'] =
        AbstractModuleSource.prototype;
    } else {
      newIntrinsics['%AbstractModuleSource%'] = ModuleSourceProto;
      newIntrinsics['%AbstractModuleSourcePrototype%'] =
        ModuleSourceProto.prototype;
    }

    const ModuleSourcePrototype = ModuleSource.prototype;
    if (ModuleSourcePrototype !== undefined) {
      newIntrinsics['%ModuleSourcePrototype%'] = ModuleSourcePrototype;

      // ModuleSource.prototype.__proto__ should be the
      // AbstractModuleSource.prototype.
      const ModuleSourcePrototypeProto = getPrototypeOf(ModuleSourcePrototype);
      if (ModuleSourcePrototypeProto === objectPrototype) {
        setPrototypeOf(ModuleSource.prototype, AbstractModuleSource.prototype);
      }
    }
  }

  return newIntrinsics;
};
