import { makeCapTP } from '@endo/captp';
import { makeDurableZone } from '@agoric/zone/durable.js';
import { M } from '@endo/patterns';

/** @import { Stream } from '@endo/stream' */

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
  captpOpts,
) => {
  /** @param {any} message */
  const send = message => {
    return writer.next(message);
  };

  const { dispatch, getBootstrap, abort } = makeCapTP(name, send, bootstrap, captpOpts);

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

export const makeKernel = baggage => {
  const zone = makeDurableZone(baggage);
  const rootStore = zone.mapStore('rootStore');
  const rootGemZone = zone.subZone('RootGemZone');

  /*
  GemZone:
    (store) 'data': { recipe }
    (subzone) 'gemRegistry': SubZone<name, GemZone>
  */

  // "GemNamespaces" are created bc zones dont allow you to lookup subZones by name more than once
  // so this loads the subZones and stores only once. registered child namespaces are cached.
  // Additionally, you cant ask what subzones exist. so we need to keep track of them ourselves.
  // So GemNamespaces serve as an abstraction for managing the gem class registration tree
  const loadGemNamespaceFromGemZone = gemZone => {
    const childCache = new Map();
    const data = gemZone.mapStore('data');
    const registry = gemZone.subZone('gemRegistry');
    const childKeys = gemZone.setStore('childKeys');
    let exoClass;
    const namespace = {
      initRecipe(gemRecipe) {
        data.init('recipe', harden(gemRecipe));
      },
      getRecipe() {
        return data.get('recipe');
      },
      // methods
      lookupChild(name) {
        if (childCache.has(name)) {
          return childCache.get(name);
        }
        childKeys.add(name);
        const childGemZone = registry.subZone(name);
        const chilldNamespace = loadGemNamespaceFromGemZone(childGemZone);
        childCache.set(name, chilldNamespace);
        return chilldNamespace;
      },
      getChildKeys() {
        return Array.from(childKeys.values());
      },
      exoClass(...args) {
        if (exoClass === undefined) {
          exoClass = gemZone.exoClass(...args);
        }
        return exoClass;
      },
    };
    return namespace;
  };

  // stores a gem recipe in the registry. for each gem, called once per universe.
  const registerGem = (parentGemNamespace, gemRecipe) => {
    const { name } = gemRecipe;
    const gemNs = parentGemNamespace.lookupChild(name);
    gemNs.initRecipe(harden(gemRecipe));
  };

  // used internally. defines a registered gem class. for each gem, called once per process.
  const loadGem = (parentGemNamespace, name) => {
    const gemNs = parentGemNamespace.lookupChild(name);
    const gemRecipe = gemNs.getRecipe();
    const { code } = gemRecipe;
    const defineChildGem = childGemRecipe => {
      // ignore if already registered
      if (gemNs.getChildKeys().includes(childGemRecipe.name)) {
        return;
      }
      registerGem(gemNs, childGemRecipe);
    };
    const compartment = new Compartment();
    const constructGem = compartment.evaluate(code);
    const {
      interface: interfaceGuards,
      init,
      methods,
    } = constructGem({
      M,
      gemName: name,
      defineChildGem,
      lookupChildGemClass: childName => loadGem(gemNs, childName),
    });
    return gemNs.exoClass(
      name,
      interfaceGuards,
      init || initWithPassthrough,
      methods,
    );
  };

  // reincarnate all registered gems
  // TODO: should be as lazy as possible

  const rootGemNamespace = loadGemNamespaceFromGemZone(rootGemZone);

  const walkGemRegistry = gemNs => {
    for (const name of gemNs.getChildKeys()) {
      loadGem(gemNs, name);
      const childGemNs = gemNs.lookupChild(name);
      walkGemRegistry(childGemNs);
    }
  };
  walkGemRegistry(rootGemNamespace);

  const registerRootGem = gemRecipe => {
    registerGem(rootGemNamespace, gemRecipe);
  };
  const loadRootGem = name => {
    return loadGem(rootGemNamespace, name);
  };
  const makeRootGem = gemRecipe => {
    registerRootGem(gemRecipe);
    const makeGem = loadRootGem(gemRecipe.name);
    return makeGem();
  };

  const kernel = {
    registerGem: registerRootGem,
    makeGem: makeRootGem,
    store: rootStore,
    ns: rootGemNamespace,
  };

  return kernel;
};
