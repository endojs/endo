import { makeModuleInstance } from './moduleInstance';

const { keys } = Object;

const makeMap = (...args) => new Map(...args);

export const makeEvaluateLinker = (evaluator, instanceCache = new Map()) => {
  const linker = {
    // Instantiation phase produces a linked module instance. A module
    // instance is linked when its importNS is populated with linked
    // module instances whose exports satify this module's imports.
    link(linkageRecord, recursiveLink, preEndowments) {
      const linkedImportNS = makeMap();
      const linkedInstance = makeModuleInstance(
        linkageRecord,
        linkedImportNS,
        evaluator,
        preEndowments,
      );
      instanceCache.set(linkageRecord.moduleId, linkedInstance);

      for (const specifier of keys(linkageRecord.imports)) {
        const moduleId = linkageRecord.moduleIds[specifier];
        const importedInstance = recursiveLink(moduleId, linker, preEndowments);
        linkedImportNS.set(moduleId, importedInstance);
      }

      return linkedInstance;
    },
    instanceCache,
  };
  return linker;
};
