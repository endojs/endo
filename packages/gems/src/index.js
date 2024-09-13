/* global setTimeout */

import { Far, makeCapTP } from '@endo/captp';
import { makeDurableZone } from '@agoric/zone/durable.js';

/** @import { Stream } from '@endo/stream' */

const getRandomId = () => Math.random().toString(36).slice(2);

const initEmpty = () => {};

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

// const makeGemFactory = ({ gemController }) => {
//   const makeGem = ({ name, makeFacet, interface: iface }) => {
//     const gemId = `gem:${getRandomId()}`;
//     console.log(`${gemId} created ("${name}")`);

//     const gemLookup = gemController.getLookup();
//     const persistenceNode = makePersistenceNode();
//     const retentionSet = new Set();

//     const incarnateEvalGem = async ({
//       name: childName,
//       interface: childIface,
//       code,
//     }) => {
//       const compartment = new Compartment({ M });
//       const childMakeFacet = compartment.evaluate(code);
//       const { gemId: childGemId, exo } = await makeGem({
//         name: childName,
//         makeFacet: childMakeFacet,
//         interface: childIface,
//       });
//       return { gemId: childGemId, exo };
//     };

//     // we wrap this here to avoid passing things to the wake controller
//     // the wake controller adds little of value as "endowments"
//     const makeFacetWithEndowments = async endowments => {
//       return makeFacet({
//         ...endowments,
//         persistenceNode,
//         retentionSet,
//         incarnateEvalGem,
//         gemLookup,
//       });
//     };
//     const wakeController = makeWakeController({
//       name,
//       makeFacet: makeFacetWithEndowments,
//     });
//     const methodNames = getInterfaceMethodKeys(iface);
//     const wrapper = makeWrapper(name, wakeController, methodNames);
//     const exo = makeExo(`${gemId}`, iface, wrapper);
//     gemController.register(gemId, exo);

//     return { gemId, exo, wakeController, persistenceNode, retentionSet };
//   };
//   return makeGem;
// };

export const makeKernel = (baggage) => {
  const zone = makeDurableZone(baggage);
  const gemZone = zone.subZone('GemZone');
  let kernel;
  let gemCreationPowers;

  const makeGem = ({ name, interfaceGuards, methods, init = initEmpty }) => {
    // maybe instead want to expose the store making functions
    const store = gemZone.mapStore(name);
    if (!store.has('state')) {
      store.init('state', harden(init()));
    }
    const exposeEndowments = (instance) => {
      // this late setting of the store seems to work around
      // an issue where the store is missing when set in
      // the initializer
      instance.state.store = store;
      instance.state.powers = harden({ gems: gemCreationPowers });

      // instance.state.powers = Far('GemPowers', {
      //   incarnateEvalGem,
      // };
    };
    // only good for singletons as here
    const initWithEndowments = (...args) => harden({ store: {}, powers: {}, ...args });
    const constructGem = zone.exoClass(name, interfaceGuards, initWithEndowments, methods, { finish: exposeEndowments });
    const gem = constructGem();
    return gem;
  }

  // kernel = zone.exo('kernel', undefined, { makeGem });
  kernel = { makeGem };

  const incarnateEvalGem = ({ name: childName, interface: childInterfaceGuards, code }) => {
    // TODO: this could happen in another Realm
    const compartment = new Compartment();
    const methods = compartment.evaluate(code);
    const gem = makeGem({
      name: childName,
      interfaceGuards: childInterfaceGuards,
      methods: methods,
    });
    return gem;
  };
  gemCreationPowers = zone.exo('kernel:gemCreationPowers', undefined, { incarnateEvalGem });

  return kernel;
};
