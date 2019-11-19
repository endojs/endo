// This file needs to provide the API that the transforms
// target.

const {
  create,
  entries,
  defineProperty: defProp,
  freeze: harden,
  getOwnPropertyDescriptors: getProps,
} = Object;

const evmap = {};
export function makeModuleInstance(
  linkageRecord,
  importNS,
  evaluator,
  preEndowments,
) {
  // {_exportName_: getter} module namespace object
  const moduleNS = create(null);

  // {_localName_: accessor} added to endowments for proxy traps
  const trappers = create(null);

  // {_localName_: init(initValue) -> initValue} used by the
  // rewritten code to initialize exported fixed bindings.
  const onceVar = create(null);

  // {_localName_: update(newValue)} used by the rewritten code to
  // both initialize and update live bindings.
  const liveVar = create(null);

  // {_localName_: [{get, set, notify}]} used to merge all the export updaters.
  const localGetNotify = create(null);

  // {_importName_: notify(update(newValue))} Used by code that imports
  // one of this module's exports, so that their update function will
  // be notified when this binding is initialized or updated.
  const notifiers = create(null);

  // console.error(linkageRecord);
  entries(linkageRecord.fixedExportMap).forEach(
    ([fixedExportName, [localName]]) => {
      let fixedGetNotify = localGetNotify[localName];
      if (!fixedGetNotify) {
        const qname = JSON.stringify(localName);

        // fixed binding state
        let value;
        let tdz = true;
        let optUpdaters = [];

        // tdz sensitive getter
        const get = () => {
          if (tdz) {
            throw new ReferenceError(`binding ${qname} not yet initialized`);
          }
          return value;
        };

        // leave tdz once
        const init = initValue => {
          // init with initValue of a declared const binding, and return
          // it.
          if (!tdz) {
            throw new Error(`Internal: binding ${qname} already initialized`);
          }
          value = initValue;
          const updaters = optUpdaters;
          optUpdaters = null;
          tdz = false;
          for (const updater of updaters) {
            updater(initValue);
          }
          return initValue;
        };

        // If still tdz, register update for notification later.
        // Otherwise, update now.
        const notify = updater => {
          if (tdz) {
            optUpdaters.push(updater);
          } else {
            updater(value);
          }
        };

        // Need these for additional exports of the local variable.
        fixedGetNotify = {
          get,
          notify,
        };
        localGetNotify[localName] = fixedGetNotify;
        onceVar[localName] = init;
      }

      defProp(moduleNS, fixedExportName, {
        get: fixedGetNotify.get,
        set: undefined,
        enumerable: true,
        configurable: false,
      });

      notifiers[fixedExportName] = fixedGetNotify.notify;
    },
  );

  entries(linkageRecord.liveExportMap).forEach(
    ([liveExportName, [localName, setProxyTrap]]) => {
      let liveGetNotify = localGetNotify[localName];
      if (!liveGetNotify) {
        const qname = JSON.stringify(liveExportName);

        // live binding state
        let value;
        let tdz = true;
        const updaters = [];

        // tdz sensitive getter
        const get = () => {
          if (tdz) {
            throw new ReferenceError(`binding ${qname} not yet initialized`);
          }
          return value;
        };

        // This must be usable locally for the translation of initializing
        // a declared local live binding variable.
        //
        // For reexported variable, this is also an update function to
        // register for notification with the downstream import, which we
        // must assume to be live. Thus, it can be called independent of
        // tdz but always leaves tdz. Such reexporting creates a tree of
        // bindings. This lets the tree be hooked up even if the imported
        // module instance isn't initialized yet, as may happen in cycles.
        const update = newValue => {
          value = newValue;
          tdz = false;
          for (const updater of updaters) {
            updater(newValue);
          }
        };

        // tdz sensitive setter
        const set = newValue => {
          if (tdz) {
            throw new ReferenceError(`binding ${qname} not yet initialized`);
          }
          value = newValue;
          for (const updater of updaters) {
            updater(newValue);
          }
        };

        // Always register the updater function.
        // If not in tdz, also update now.
        const notify = updater => {
          updaters.push(updater);
          if (!tdz) {
            updater(value);
          }
        };

        liveGetNotify = {
          get,
          notify,
        };

        localGetNotify[localName] = liveGetNotify;
        if (setProxyTrap) {
          defProp(trappers, localName, {
            get,
            set,
            enumerable: true,
            configurable: false,
          });
        }
        liveVar[localName] = update;
      }

      defProp(moduleNS, liveExportName, {
        get: liveGetNotify.get,
        set: undefined,
        enumerable: true,
        configurable: false,
      });

      notifiers[liveExportName] = liveGetNotify.notify;
    },
  );

  const notifyStar = update => {
    update(moduleNS);
  };
  notifiers['*'] = notifyStar;

  // The updateRecord must conform to linkageRecord.imports
  // updateRecord = Map<specifier, importUpdaters>
  // importUpdaters = Map<importName, [update(newValue)*]>
  async function imports(updateRecord, exportAlls) {
    // By the time imports is called, the importNS should already be
    // initialized with module instances that satisfy
    // linkageRecord.imports.
    // importNS = Map[_specifier_, { initialize, notifiers }]
    // notifiers = { _importName_: notify(update(newValue))}
    const ps = [];
    for (const [specifier, importUpdaters] of updateRecord.entries()) {
      const moduleId = linkageRecord.moduleIds[specifier];
      const instance = importNS.get(moduleId);
      const p = instance
        .initialize() // bottom up cycle tolerant
        .then(() => {
          const { notifiers: modNotifiers } = instance;
          for (const [importName, updaters] of importUpdaters.entries()) {
            const notify = modNotifiers[importName];
            for (const updater of updaters) {
              notify(updater);
            }
          }
        });
      ps.push(p);
    }
    await Promise.all(ps);
    // Execute the export * from 'mod' clauses in order.
    for (const specifier of exportAlls) {
      const moduleId = linkageRecord.moduleIds[specifier];
      const instance = importNS.get(moduleId);
      // eslint-disable-next-line no-await-in-loop
      await instance.initialize().then(() => {
        const { notifiers: modNotifiers } = instance;
        for (const [importName, notify] of Object.entries(modNotifiers)) {
          if (!notifiers[importName]) {
            notifiers[importName] = notify;

            // exported live binding state
            let value;
            notify(v => (value = v));
            defProp(moduleNS, importName, {
              get() {
                return value;
              },
              set: undefined,
              enumerable: true,
              configurable: false,
            });
          }
        }
      });
    }
  }

  const endowments = create(null, {
    // TODO should check for collisions.
    // TODO should check that preEndowments has no $h_stuff names.
    // Neither is a security hole since trappers replace conflicting
    // preEndowments
    ...getProps(preEndowments),
    ...getProps(trappers),
  });

  const { functorSource } = linkageRecord;
  if (evmap[functorSource]) {
    // console.error(`already evaluated`, linkageRecord.moduleId, functorSource);
  }
  evmap[functorSource] = true;
  let optFunctor = evaluator(functorSource, endowments);
  async function initialize() {
    if (optFunctor) {
      // uninitialized
      const functor = optFunctor;
      optFunctor = null;
      // initializing - call with `this` of `undefined`.
      await functor(harden({ imports, onceVar, liveVar }));
      // initialized
    }
  }

  return harden({
    linkageRecord,
    moduleNS,
    notifiers,
    initialize,
  });
}
