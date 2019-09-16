import { link } from "fs";

// This file needs to provide the API that the transforms
// target.

const {
  create,
  entries,
  defineProperty: defProp,
  freeze: harden,
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

  // {_localName_: accessor} added to endowments for proxy traps
  const trappers = create(null);

  // {_fixedExportName_: init(initValue) -> initValue} used by the
  // rewritten code to initialize exported fixed bindings.
  const constVal = create(null);

  // {_liveExportName_: update(newValue)} used by the rewritten code to
  // both initiailize and update live bindings.
  const letVal = create(null);

  // {_importName_: notify(update(newValue))} Used by code that imports
  // one of this module's exports, so that their update function will
  // be notified when this binding is initialized or updated.
  const notifiers = create(null);

  for (const fixedExportName of linkageRecord.fixedExports) {
    const qname = JSON.stringify(fixedExportName);

    // fixed binding state
    let value;
    let tdz = true;
    let optUpdaters = []; // optUpdaters === null iff tdz === false

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

    defProp(moduleNS, fixedExportName, {
      get,
      set: undefined,
      enumerable: true,
      configurable: false,
    });

    constVal[fixedExportName] = init;
    notifiers[fixedExportName] = notify;
  }

  for (const [liveExportName, vars] of entries(linkageRecord.liveExportMap)) {
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

    defProp(moduleNS, liveExportName, {
      get,
      set: undefined,
      enumerable: true,
      configurable: false,
    });

    for (const localName of vars) {
      defProp(trappers, localName, {
        get,
        set,
        enumerable: true,
        configurable: false,
      });
    }

    letVal[liveExportName] = update;
    notifiers[liveExportName] = notify;
  }

  const notifyStar = update => {
    update(moduleNS);
  };
  notifiers['*'] = notifyStar;

  // The updateRecord must conform to linkageRecord.imports
  // updateRecord = { _specifier_: importUpdaters }
  // importUpdaters = { _importName_: [update(newValue)*] }}
  function imports(updateRecord) {
    // By the time imports is called, the importNS should already be
    // initialized with module instances that satisfy
    // linkageRecord.imports.
    // importNS = Map[_specifier_, { initialize, notifiers }]
    // notifiers = { _importName_: notify(update(newValue))}
    for (const [specifier, importUpdaters] of entries(updateRecord)) {
      const moduleId = linkageRecord.moduleIds[specifier];
      const instance = importNS.get(moduleId);
      instance.initialize(); // bottom up cycle tolerant
      const { notifiers: modNotifiers } = instance;
      for (const [importName, updaters] of entries(importUpdaters)) {
        const notify = modNotifiers[importName];
        for (const update of updaters) {
          notify(update);
        }
      }
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
  let optFunctor = evaluator(functorSource, endowments);
  function initialize() {
    if (optFunctor) {
      // uninitialized
      const functor = optFunctor;
      optFunctor = null;
      // initializing - call with `this` of `undefined`.
      functor(harden({ imports, constVal, letVal }));
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
