export const makeImporter = (importHooks, moduleCache = new Map()) => {
  const {
    // Functions for the pipeline.
    resolve,
    locate,
    retrieve,
    rewrite,
    rootContainer,
  } = importHooks;

  let importer;
  function recursiveLink(moduleId, container, preEndowments) {
    const subContainer =
      (container.containerFor && container.containerFor(moduleId)) || container;

    let moduleInstance = subContainer.instanceCache.get(moduleId);
    if (moduleInstance) {
      return moduleInstance;
    }

    // Translate the linkage record into a module instance, and cache it.
    const linkageRecord = moduleCache.get(moduleId);
    moduleInstance = subContainer.link(
      linkageRecord,
      makeImporter,
      preEndowments,
    );
    subContainer.instanceCache.set(moduleId, moduleInstance);

    return moduleInstance;
  }

  async function loadOne(specifier, referrer) {
    const scopedRef = resolve(specifier, referrer);
    const moduleId = await locate(scopedRef);

    let loadedP = moduleCache.get(moduleId);
    if (!loadedP) {
      // Begin the recursive load.
      loadedP = retrieve(moduleId)
        .then(body => rewrite({ sourceType: 'module', src: body }))
        .then(({ linkageRecord }) => {
          // Prevent circularity.
          moduleCache.set(moduleId, linkageRecord);
          return Promise.all(
            Object.keys(linkageRecord.imports).map(spec =>
              loadOne(spec, moduleId),
            ),
          );
        });
      moduleCache.set(moduleId, loadedP);
    }

    // Loading in progress, or already a moduleId with linkageRecord.
    // Our caller really just wants to know the moduleId.
    return Promise.resolve(loadedP).then(() => moduleId);
  }

  importer = async (srcSpec, preEndowments) => {
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
    const moduleInstance = recursiveLink(
      moduleId,
      rootContainer,
      preEndowments,
    );
    return moduleInstance.initialize();
  };

  return importer;
};
