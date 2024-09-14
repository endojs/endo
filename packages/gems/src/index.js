/* global setTimeout */

import { makeCapTP } from '@endo/captp';
import { makeDurableZone } from '@agoric/zone/durable.js';
import { M } from '@endo/patterns';

/** @import { Stream } from '@endo/stream' */

const getRandomId = () => Math.random().toString(36).slice(2);

const initEmpty = () => {};
const initWithPassthrough = ({ ...args } = {}) => harden({ ...args });

/**
 * @template TBootstrap
 * @param {string} name
 * @param {Stream<unknown, any, unknown, unknown>} writer
 * @param {Stream<any, undefined, undefined, undefined>} reader
 * @param {Promise<void>} cancelled
 * @param {TBootstrap} bootstrap
 */
export const makeMessageCapTP = (
  name,
  writer,
  reader,
  cancelled,
  bootstrap,
) => {
  /** @param {any} message */
  const send = message => {
    return writer.next(message);
  };

  const { dispatch, getBootstrap, abort } = makeCapTP(name, send, bootstrap);

  const drained = (async () => {
    for await (const message of reader) {
      dispatch(message);
    }
  })();

  const closed = cancelled.catch(async () => {
    abort();
    await Promise.all([writer.return(undefined), drained]);
  });

  return {
    getBootstrap,
    closed,
  };
};

export const makeKernel = (baggage) => {
  const zone = makeDurableZone(baggage);
  const rootGemZone = zone.subZone('RootGemZone');
  let kernel;
  // let gemCreationPowers;

  /*
  GemZone:
    (store) 'data': { recipe }
    (store) 'instances': WeakMap<gem instance, StorageMap>
    (subzone) 'gemRegistry': SubZone<name, GemZone>
  */

  // "GemNamespaces" are created bc zones dont allow you to lookup subZones by name more than once
  // so this loads the subZones and stores only once. registered child namespaces are cached.
  const loadGemNamespaceFromGemZone = (gemZone) => {
    const namespace = {
      data: gemZone.mapStore('data'),
      instances: gemZone.weakMapStore('instances'),
      registry: gemZone.subZone('gemRegistry'),
      zone: gemZone,
      children: {},
    }
    return namespace;
  }
  const lookupChildGemNamespace = (parentGemNamespace, name) => {
    if (parentGemNamespace.children[name]) {
      return parentGemNamespace.children[name];
    }
    const gemZone = parentGemNamespace.registry.subZone(name);
    const namespace = loadGemNamespaceFromGemZone(gemZone);
    parentGemNamespace.children[name] = namespace;
    return namespace;
  }

  // stores a gem recipe in the registry. for each gem, called once per universe.
  const registerGem = (parentGemNamespace, gemRecipe) => {
    const gemNs = lookupChildGemNamespace(parentGemNamespace, gemRecipe.name);
    gemNs.data.init('recipe', harden(gemRecipe));
  }

  // used internally. defines a registered gem class. for each gem, called once per process.
  const loadGem = (parentGemNamespace, name) => {
    const gemNs = lookupChildGemNamespace(parentGemNamespace, name);
    const gemRecipe = gemNs.data.get('recipe');

    const getStoreForInstance = (instance) => {
      if (!gemNs.instances.has(instance)) {
        const store = harden(init());
        gemNs.instances.init(instance, store);
      }
      const store = {
        get () {
          return gemNs.instances.get(instance);
        },
        set (value) {
          gemNs.instances.set(instance, harden(value));
        },
      }
      return store;
    }
    
    const { code } = gemRecipe;
    const compartment = new Compartment();
    const constructGem = compartment.evaluate(code);
    const { interface: interfaceGuards, init, methods } = constructGem({
      M,
      gemName: name,
      getStore: getStoreForInstance,
    });

    return gemNs.zone.exoClass(name, interfaceGuards, initWithPassthrough, methods);
  }

  // reincarnate all registered gems
  // TODO: should be as lazy as possible

  // const walkGemRegistry = (gemZone) => {
  //   const gemRegistry = gemZone.mapStore('gemRegistry');
  //   for (const [name, gemRecipe] of gemRegistry.entries()) {
  //     loadGem(gemZone, name);
  //   }
  // }
  // walkGemRegistry(rootGemZone);

  const rootGemNamespace = loadGemNamespaceFromGemZone(rootGemZone);
  const registerRootGem = (gemRecipe) => {
    registerGem(rootGemNamespace, gemRecipe);
  }
  const loadRootGem = (name) => {
    return loadGem(rootGemNamespace, name);
  }
  const makeRootGem = (gemRecipe) => {
    registerRootGem(gemRecipe);
    const makeGem = loadRootGem(gemRecipe.name);
    return makeGem();
  }

  kernel = { registerGem: registerRootGem, makeGem: makeRootGem };

  // const incarnateEvalGem = ({ name: childName, interface: childInterfaceGuards, code }) => {
  //   // TODO: this could happen in another Realm
  //   const compartment = new Compartment();
  //   const methods = compartment.evaluate(code);
  //   const gem = makeGem({
  //     name: childName,
  //     interfaceGuards: childInterfaceGuards,
  //     methods: methods,
  //   });
  //   return gem;
  // };
  // gemCreationPowers = zone.exo('kernel:gemCreationPowers', undefined, { incarnateEvalGem });

  return kernel;
};
