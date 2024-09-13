/* global setTimeout */

import { makeCapTP } from '@endo/captp';
import { makeDurableZone } from '@agoric/zone/durable.js';

/** @import { Stream } from '@endo/stream' */

const noop = (...args) => {};
const never = new Promise(() => {});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export const util = { noop, never, delay };

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

// const makePersistenceNode = () => {
//   let value;
//   return {
//     get() {
//       return value;
//     },
//     set(newValue) {
//       if (typeof newValue !== 'string') {
//         throw new Error(
//           `persistence node expected string (got "${typeof newValue}")`,
//         );
//       }
//       value = newValue;
//     },
//   };
// };

// const makeWakeController = ({ name, makeFacet }) => {
//   let isAwake = false;
//   let target;
//   let currentFacetId;

//   let controller;

//   const triggerSleep = targetFacetId => {
//     if (currentFacetId === targetFacetId) {
//       console.log(
//         `gem:${name}/facet:${targetFacetId} being put to sleep (due to GC)`,
//       );
//       controller.sleep();
//     }
//   };

//   // is it theoretically possible for a facet to get GC'd while handling a message?
//   // i was unable to observe it happening
//   const registry = new FinalizationRegistry(facetId => {
//     console.log(`gem:${name}/facet:${facetId} has been garbage collected.`);
//     triggerSleep(facetId);
//   });

//   controller = {
//     async wake() {
//       await null;
//       // need to handle case where marked as awake but target is garbage collected
//       if (isAwake && target && target.deref() !== undefined)
//         return target.deref();
//       // bug when wake is inflight
//       const facetId = Math.random().toString(36).slice(2);
//       // simulate startup process
//       await delay(200);
//       const facet = await makeFacet({
//         // for debugging:
//         facetId,
//       });
//       target = new WeakRef(facet);
//       currentFacetId = facetId;
//       registry.register(facet, facetId);
//       console.log(`gem:${name}/facet:${facetId} created`);
//       isAwake = true;
//       return facet;
//     },
//     async sleep() {
//       await null;
//       if (!isAwake) return;
//       console.log(`gem:${name}/facet:${currentFacetId} being put to sleep`);
//       // simulate shutdown process
//       // bug when sleep is inflight
//       await delay(200);
//       target = undefined;
//       isAwake = false;
//     },
//     isAwake() {
//       return isAwake;
//     },
//     assertAwake() {
//       if (!isAwake) {
//         throw new Error('not awake');
//       }
//     },
//   };

//   return controller;
// };

// const makeWrapper = (name, wakeController, methodNames) => {
//   return Object.fromEntries(
//     methodNames.map(methodName => {
//       return [
//         methodName,
//         async function wrapperFn(...args) {
//           console.log(`gem:${name} ${methodName} called`);
//           const facet = await wakeController.wake();
//           // load bearing codesmell against unseen enemies.
//           // uhhhh, use (return-await + noop) to retain a strong reference to `facet` to
//           // to prevent GC of facet before fully responding to a message.
//           // we want the GC event to imply that the facet is no longer in use.
//           // but we dont get many guarantees about when the GC event will fire.
//           // this problem has not been witnessed,
//           // this solution has not been verified.
//           const result = await facet[methodName](...args);
//           noop(facet);
//           return result;
//         },
//       ];
//     }),
//   );
// };

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

const makeGemFactory = (zone) => {
  const gemZone = zone.subZone('GemZone');
  const makeGem = ({ name, interfaceGuards, methods, init = initEmpty }) => {
    // maybe instead want to expose the store making functions
    const store = gemZone.mapStore(name);
    if (!store.has('state')) {
      store.init('state', harden(init()));
    }
    const finalizeStore = (instance) => {
      // this late setting of the store seems to work around
      // an issue where the store is missing despite being set in
      // the initializer
      instance.state.store = store;
    };
    // only good for singletons as here
    const initWithStore = (store, ...args) => harden({ store, ...args });
    const constructGem = zone.exoClass(name, interfaceGuards, initWithStore, methods, { finish: finalizeStore });
    const gem = constructGem();
    return gem;
  }

  return makeGem;
}

export const makeKernel = (baggage) => {
  const zone = makeDurableZone(baggage);
  const makeGem = makeGemFactory(zone);
  return {
    makeGem,
  };
};
