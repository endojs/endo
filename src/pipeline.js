export const makeImportPipeline = (
  importHooks,
  moduleCache = new Map(),
  rewriters = new Map(),
) => {
  const {
    // Functions for the pipeline.
    resolve,
    locate,
    retrieve,
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
      const moduleId = resolve(specifier, referrer);
      if (!moduleCache.has(moduleId)) {
        // This is sequential because we are beginning an import cycle.

        // Get a location, and retrieve it with rewriting.
        const location = await locate(moduleId);
        const linkageRecord = await retrieve(location, rewriters);
        moduleCache.set(moduleId, linkageRecord);
      }

      // Begin initialization of the linked modules.
      const moduleInstance = recursiveLink(moduleId, rootContainer);
      return moduleInstance.initialize();
    };
  };

  return makeImporter;
};
