export const makeImporter = (importHooks, moduleCache = new Map()) => {
  const {
    // Functions for the pipeline.
    resolve,
    locate,
    retrieve,
    rewrite,
    rootLinker,
  } = importHooks;

  function recursiveLink(moduleId, linker, preEndowments) {
    const subLinker =
      (linker.linkerFor && linker.linkerFor(moduleId)) || linker;

    let moduleInstance = subLinker.instanceCache.get(moduleId);
    if (moduleInstance) {
      return moduleInstance;
    }

    // Translate the linkage record into a module instance, and cache it.
    const linkageRecord = moduleCache.get(moduleId);
    moduleInstance = subLinker.link(
      linkageRecord, // has url
      recursiveLink,
      preEndowments,
    );
    subLinker.instanceCache.set(moduleId, moduleInstance);

    return moduleInstance;
  }

  async function loadOne(specifier, referrer) {
    const scopedRef = resolve(specifier, referrer);
    const moduleId = await locate(scopedRef);

    let loadedP = moduleCache.get(moduleId);
    if (!loadedP) {
      // Begin the recursive load.
      loadedP = retrieve(moduleId)
        .then(body => rewrite(body, moduleId))
        .then(({ staticRecord: sr }) => {
          // Prevent circularity.
          const linkageRecord = { ...sr, moduleIds: {}, moduleId };
          // console.log(`linkageRecord`, linkageRecord);
          moduleCache.set(moduleId, linkageRecord);
          return Promise.all(
            Object.keys(linkageRecord.imports).map(spec =>
              loadOne(spec, moduleId).then(
                // Populate the record from the specifier to the moduleId.
                subModuleId => (linkageRecord.moduleIds[spec] = subModuleId),
              ),
            ),
          );
        });
      moduleCache.set(moduleId, loadedP);
    }

    // Loading in progress, or already a moduleId with linkageRecord.
    // Our caller really just wants to know the moduleId.
    return Promise.resolve(loadedP).then(() => moduleId);
  }

  const importer = async (srcSpec, preEndowments) => {
    const { spec, linkageRecord, url } = srcSpec;
    let moduleId;
    if (linkageRecord !== undefined) {
      // The linkage record is already prepared,
      // so bypass the rewriter.
      moduleId = {
        toString() {
          return `linkageRecord:${url}`;
        },
      };
      moduleCache.set(moduleId, linkageRecord);
    } else {
      moduleId = await loadOne(spec, url);
    }

    // Begin initialization of the linked modules.
    const moduleInstance = recursiveLink(moduleId, rootLinker, preEndowments);
    await moduleInstance.initialize();
    return moduleInstance.moduleNS;
  };

  return importer;
};
