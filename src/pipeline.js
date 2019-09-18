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

  async function loadOne(specifier, staticRecord, referrer) {
    let moduleId;
    if (staticRecord === undefined) {
      const scopedRef = resolve(specifier, referrer);
      moduleId = await locate(scopedRef);
    } else {
      // The static record is already prepared, so bypass the rewriter.
      // This fresh object ensures we don't clash in the cache.
      moduleId = {
        toString() {
          return `${referrer}`;
        },
      };
    }

    let loadedP = moduleCache.get(moduleId);
    if (!loadedP) {
      let getStaticRecordP;
      if (staticRecord === undefined) {
        // Begin the recursive load.
        getStaticRecordP = retrieve(moduleId).then(body =>
          rewrite(body, moduleId),
        );
      } else {
        getStaticRecordP = Promise.resolve({ staticRecord });
      }

      loadedP = getStaticRecordP.then(rs => {
        // Prevent circularity.
        // console.log(`rs`, rs);
        const linkageRecord = { ...rs.staticRecord, moduleIds: {}, moduleId };
        // console.log(`linkageRecord`, linkageRecord);
        moduleCache.set(moduleId, linkageRecord);
        return Promise.all(
          Object.keys(linkageRecord.imports).map(spec =>
            // eslint-disable-next-line no-use-before-define
            loadOne(spec, undefined, moduleId).then(
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
    const { spec, staticRecord, url } = srcSpec;
    const moduleId = await loadOne(spec, staticRecord, url);

    // Begin initialization of the linked modules.
    const moduleInstance = recursiveLink(moduleId, rootLinker, preEndowments);
    await moduleInstance.initialize();
    return moduleInstance.moduleNS;
  };

  return importer;
};
