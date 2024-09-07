/* global setTimeout */

import { makeCapTP } from '@endo/captp';
import { Far } from '@endo/far';

/** @import { Stream } from '@endo/stream' */

const noop = (...args) => {};
const never = new Promise(() => {});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export const util = { noop, never, delay };

const getRandomId = () => Math.random().toString(36).slice(2);

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

const makePersistenceNode = () => {
  let value;
  return {
    get() {
      return value;
    },
    set(newValue) {
      if (typeof newValue !== 'string') {
        throw new Error(
          `persistence node expected string (got "${typeof newValue}")`,
        );
      }
      value = newValue;
    },
  };
};

const makeWakeController = ({ name, makeFacet }) => {
  let isAwake = false;
  let target;
  let currentFacetId;

  let controller;

  const triggerSleep = targetFacetId => {
    if (currentFacetId === targetFacetId) {
      console.log(
        `gem:${name}/facet:${targetFacetId} being put to sleep (due to GC)`,
      );
      controller.sleep();
    }
  };

  // is it theoretically possible for a facet to get GC'd while handling a message?
  // i was unable to observe it happening
  const registry = new FinalizationRegistry(facetId => {
    console.log(`gem:${name}/facet:${facetId} has been garbage collected.`);
    triggerSleep(facetId);
  });

  controller = {
    async wake() {
      await null;
      // need to handle case where marked as awake but target is garbage collected
      if (isAwake && target && target.deref() !== undefined)
        return target.deref();
      // bug when wake is inflight
      const facetId = Math.random().toString(36).slice(2);
      // simulate startup process
      await delay(200);
      const facet = await makeFacet({
        // for debugging:
        facetId,
      });
      target = new WeakRef(facet);
      currentFacetId = facetId;
      registry.register(facet, facetId);
      console.log(`gem:${name}/facet:${facetId} created`);
      isAwake = true;
      return facet;
    },
    async sleep() {
      await null;
      if (!isAwake) return;
      console.log(`gem:${name}/facet:${currentFacetId} being put to sleep`);
      // simulate shutdown process
      // bug when sleep is inflight
      await delay(200);
      target = undefined;
      isAwake = false;
    },
    isAwake() {
      return isAwake;
    },
    assertAwake() {
      if (!isAwake) {
        throw new Error('not awake');
      }
    },
  };

  return controller;
};

const makeWrapper = (name, wakeController, methodNames) => {
  return Object.fromEntries(
    methodNames.map(methodName => {
      return [
        methodName,
        async function wrapperFn(...args) {
          console.log(`gem:${name} ${methodName} called`);
          const facet = await wakeController.wake();
          // load bearing codesmell against unseen enemies.
          // uhhhh, use (return-await + noop) to retain a strong reference to `facet` to
          // to prevent GC of facet before fully responding to a message.
          // we want the GC event to imply that the facet is no longer in use.
          // but we dont get many guarantees about when the GC event will fire.
          // this problem has not been witnessed,
          // this solution has not been verified.
          const result = await facet[methodName](...args);
          noop(facet);
          return result;
        },
      ];
    }),
  );
};

const makeGemFactory = ({ gemController }) => {
  return ({ name, makeFacet, methodNames }) => {
    const gemId = `gem:${getRandomId()}`;
    console.log(`${gemId} created ("${name}")`);

    const gemLookup = gemController.getLookup();
    const persistenceNode = makePersistenceNode();
    // we wrap this here to avoid passing things to the wake controller
    // the wake controller adds little of value as "endowments"
    const makeFacetWithEndowments = async endowments => {
      return makeFacet({
        ...endowments,
        persistenceNode,
        gemLookup,
      });
    };
    const wakeController = makeWakeController({
      name,
      makeFacet: makeFacetWithEndowments,
    });
    const wrapper = makeWrapper(name, wakeController, methodNames);
    const target = Far(`${gemId}`, wrapper);
    gemController.register(gemId, target);

    return { target, wakeController };
  };
};

const makeGemController = () => {
  const gemIdToGem = new Map();
  const gemToGemId = new WeakMap();

  const getGemById = gemId => {
    return gemIdToGem.get(gemId);
  };
  const getGemId = gem => {
    // if (!gemToGemId.has(gem)) {
    //   throw new Error(`Gem not found in lookup ("${gem}")`);
    // }
    // return gemToGemId.get(gem);

    // this is a hack to get the gem id from the remote ref
    // this is prolly not safe or something
    // some identity discontinuity happening with the first technique
    const str = String(gem);
    const startIndex = str.indexOf('Alleged: ');
    const endIndex = str.indexOf(']');
    if (startIndex === -1 || endIndex === -1) {
      throw new Error(`Could not find gem id in remote ref ("${str}")`);
    }
    const gemId = str.slice(startIndex + 9, endIndex);
    if (!gemId) {
      throw new Error('Gem id was empty');
    }
    if (!gemId.startsWith('gem:')) {
      throw new Error('Gem id did not start with gem:');
    }
    return gemId;
  };
  const register = (gemId, gem) => {
    if (gemIdToGem.has(gemId)) {
      throw new Error(`Gem id already registered ("${gemId}")`);
    }
    console.log(`${gemId} registered: ${gem}`);
    gemIdToGem.set(gemId, gem);
    gemToGemId.set(gem, gemId);
  };

  return {
    register,
    getGemById,
    getGemId,
    getLookup() {
      return {
        getGemById,
        getGemId,
      };
    },
  };
};

export const makeKernel = () => {
  const gemController = makeGemController();
  const makeGem = makeGemFactory({ gemController });
  return {
    makeGem,
    gemController,
  };
};
