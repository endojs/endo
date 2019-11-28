/* global SES */
// This file needs to provide the API that the transforms
// target.

const harden = (typeof SES !== 'undefined' && SES.harden) || Object.freeze;

const {
  create,
  entries,
  keys,
  defineProperty: defProp,
  getOwnPropertyDescriptors: getProps,
} = Object;

export function makeModuleInstance(
  linkageRecord,
  importNS,
  evaluator,
  preEndowments,
) {
  // {_exportName_: getter} module namespace object
  const moduleNS = create(null);
  const moduleNSProps = create(null);

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
          if (updater === init) {
            // Prevent recursion.
            return;
          }
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

      moduleNSProps[fixedExportName] = {
        get: fixedGetNotify.get,
        set: undefined,
        enumerable: true,
        configurable: false,
      };

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
          if (updater === update) {
            // Prevent recursion.
            return;
          }
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

      moduleNSProps[liveExportName] = {
        get: liveGetNotify.get,
        set: undefined,
        enumerable: true,
        configurable: false,
      };

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
  function imports(updateRecord) {
    // By the time imports is called, the importNS should already be
    // initialized with module instances that satisfy
    // linkageRecord.imports.
    // importNS = Map[_specifier_, { initialize, notifiers }]
    // notifiers = { _importName_: notify(update(newValue))}

    // export * cannot export default.
    const candidateAll = create(null);
    candidateAll.default = false;
    for (const [specifier, importUpdaters] of updateRecord.entries()) {
      const moduleLocation = linkageRecord.moduleLocations[specifier];
      const instance = importNS.get(moduleLocation);
      instance.getNamespace(); // bottom up cycle tolerant
      const { notifiers: modNotifiers } = instance;
      for (const [importName, updaters] of importUpdaters.entries()) {
        const notify = modNotifiers[importName];
        if (!notify) {
          throw SyntaxError(
            `The requested module '${moduleLocation}' does not provide an export named '${importName}'`,
          );
        }
        for (const updater of updaters) {
          notify(updater);
        }
      }
      if (linkageRecord.exportAlls.includes(specifier)) {
        // Make all these imports candidates.
        for (const [importName, notify] of entries(modNotifiers)) {
          if (candidateAll[importName] === undefined) {
            candidateAll[importName] = notify;
          } else {
            // Already a candidate: remove ambiguity.
            candidateAll[importName] = false;
          }
        }
      }
    }

    for (const [importName, notify] of entries(candidateAll)) {
      if (!notifiers[importName] && notify !== false) {
        notifiers[importName] = notify;

        // exported live binding state
        let value;
        notify(v => (value = v));
        moduleNSProps[importName] = {
          get() {
            return value;
          },
          set: undefined,
          enumerable: true,
          configurable: false,
        };
      }
    }

    // Sort the module namespace as per spec.
    // TODO should create something more like a
    // "Module Namespace Exotic Object".
    keys(moduleNSProps)
      .sort()
      .forEach(k => defProp(moduleNS, k, moduleNSProps[k]));
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
  // console.log(functorSource);
  let optFunctor = evaluator(functorSource, endowments);
  let didThrow = false;
  let thrownError;
  function getNamespace() {
    if (optFunctor) {
      // uninitialized
      const functor = optFunctor;
      optFunctor = null;
      // initializing - call with `this` of `undefined`.
      try {
        functor(harden({ imports, onceVar, liveVar }));
      } catch (e) {
        didThrow = true;
        thrownError = e;
      }
      // initialized
    }
    if (didThrow) {
      throw thrownError;
    }
    return moduleNS;
  }

  return harden({
    linkageRecord,
    notifiers,
    getNamespace,
  });
}
