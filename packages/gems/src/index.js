/* global setTimeout */

import { makeCapTP } from '@endo/captp';
import { Far } from '@endo/far';

/** @import { Stream } from '@endo/stream' */

const noop = (...args) => {};
const never = new Promise(() => {});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export const util = { noop, never, delay };

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
        throw new Error('persistence node expected string');
      }
      value = newValue;
    },
  };
};

const makeWakeController = ({ name, makeFacet, persistenceNode }) => {
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
      const facet = await makeFacet({ persistenceNode, facetId });
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

export const makeGem = ({ name, makeFacet, methodNames }) => {
  console.log(`gem:${name} created`);

  const persistenceNode = makePersistenceNode();
  const wakeController = makeWakeController({
    name,
    makeFacet,
    persistenceNode,
  });
  const wrapper = makeWrapper(name, wakeController, methodNames);
  const target = Far(`gem:${name}`, wrapper);

  return { target, wakeController };
};
