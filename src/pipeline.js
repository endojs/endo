export const makeImporter = (importHooks, moduleCache = new Map()) => {
  const {
    // Functions for the pipeline.
    resolve,
    locate,
    retrieve,
    analyze,
    rootLinker,
  } = importHooks;

  function recursiveLink(moduleLocation, linker, preEndowments) {
    const subLinker =
      (linker.linkerFor && linker.linkerFor(moduleLocation)) || linker;

    let moduleInstance = subLinker.instanceCache.get(moduleLocation);
    if (moduleInstance) {
      return moduleInstance;
    }

    // Translate the linkage record into a module instance, and cache it.
    const linkageRecord = moduleCache.get(moduleLocation);
    moduleInstance = subLinker.link(
      linkageRecord, // has moduleLocation
      recursiveLink,
      preEndowments,
    );
    subLinker.instanceCache.set(moduleLocation, moduleInstance);

    return moduleInstance;
  }

  async function loadOne(specifier, staticRecord, referrer) {
    let moduleLocation;
    if (staticRecord === undefined) {
      const absoluteSpecifier = resolve(specifier, referrer);
      moduleLocation = await locate(absoluteSpecifier);
    } else {
      // The static record is already prepared, so bypass the rewriter.
      // This fresh object ensures we don't clash in the cache.
      moduleLocation = {
        toString() {
          return `${referrer}`;
        },
      };
    }

    let loadedP = moduleCache.get(moduleLocation);
    if (!loadedP) {
      let getStaticRecordP;
      if (staticRecord === undefined) {
        // Begin the recursive analysis.
        getStaticRecordP = retrieve(moduleLocation)
          .then(analyze)
          .then(sr => ({ staticRecord: sr }));
      } else {
        // We are injecting a pre-created static record.
        getStaticRecordP = Promise.resolve({ staticRecord });
      }

      loadedP = getStaticRecordP.then(rs => {
        // Prevent circularity.
        // console.log(`rs`, rs);
        const linkageRecord = {
          ...rs.staticRecord,
          moduleLocations: {},
          moduleLocation,
        };
        // console.log(`linkageRecord`, linkageRecord);
        moduleCache.set(moduleLocation, linkageRecord);
        return Promise.all(
          Object.keys(linkageRecord.imports || {}).map(spec =>
            // eslint-disable-next-line no-use-before-define
            loadOne(spec, undefined, moduleLocation).then(
              // Populate the record from the specifier to the moduleLocation.
              subModuleLocation =>
                (linkageRecord.moduleLocations[spec] = subModuleLocation),
            ),
          ),
        );
      });

      moduleCache.set(moduleLocation, loadedP);
    }

    // Loading in progress, or already a moduleLocation with linkageRecord.
    // Our caller really just wants to know the moduleLocation.
    return Promise.resolve(loadedP).then(() => moduleLocation);
  }

  const importer = async (srcSpec, preEndowments) => {
    const { specifier, staticRecord, referrer } = srcSpec;
    const moduleLocation = await loadOne(specifier, staticRecord, referrer);

    // Begin initialization of the linked modules.
    const moduleInstance = recursiveLink(
      moduleLocation,
      rootLinker,
      preEndowments,
    );
    return moduleInstance.getNamespace();
  };

  return importer;
};
