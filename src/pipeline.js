export const makeImportPipeline = (importHooks, moduleCache = new Map()) => {
  const {
    // Functions for the pipeline.
    resolve,
    locate,
    retrieve,
    rewrite,
    rootContainer,
  } = importHooks;

  let makeImporter;
  function recursiveLink(moduleId, container) {
    const subContainer =
      (container.containerFor && container.containerFor(moduleId)) || container;

    let moduleInstance = subContainer.instanceCache.get(moduleId);
    if (moduleInstance) {
      return moduleInstance;
    }

    // Translate the linkage record into a module instance, and cache it.
    const linkageRecord = moduleCache.get(moduleId);
    moduleInstance = subContainer.link(linkageRecord, makeImporter);
    subContainer.instanceCache.set(moduleId, moduleInstance);

    return moduleInstance;
  }

  makeImporter = referrer => {
    return async specifier => {
      const scopedRef = resolve(specifier, referrer);
      const moduleId = await locate(scopedRef);
      if (!moduleCache.has(moduleId)) {
        // This is sequential because we are beginning an import cycle.
        const body = await retrieve(moduleId);
        const linkageRecord = await rewrite(moduleId, body);
        moduleCache.set(moduleId, linkageRecord);
      }

      // Begin initialization of the linked modules.
      const moduleInstance = recursiveLink(moduleId, rootContainer);
      return moduleInstance.initialize();
    };
  };

  return makeImporter;
};
