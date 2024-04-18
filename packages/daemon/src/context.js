// @ts-check

import { makePromiseKit } from '@endo/promise-kit';

/** @import { PromiseKit } from '@endo/promise-kit' */
/** @import { Context } from './types.js' */

export const makeContextMaker = ({ controllerForId, provideController }) => {
  /**
   * @param {string} id
   */
  const makeContext = id => {
    let done = false;
    const { promise: cancelled, reject: rejectCancelled } =
      /** @type {PromiseKit<never>} */ (makePromiseKit());
    const { promise: disposed, resolve: resolveDisposed } =
      /** @type {PromiseKit<void>} */ (makePromiseKit());

    /** @type {Map<string, Context>} */
    const dependents = new Map();
    /** @type {Array<() => void>} */
    const hooks = [];

    /**
     * @param {Error} reason
     * @param {string} [prefix]
     */
    const cancel = (reason, prefix = '*') => {
      if (done) return disposed;
      done = true;
      rejectCancelled(reason || harden(new Error('Cancelled')));

      console.log(`${prefix} ${id}`);

      controllerForId.delete(id);
      for (const dependentContext of dependents.values()) {
        dependentContext.cancel(reason, ` ${prefix}`);
      }
      dependents.clear();

      // Execute all cancellation hooks and resolve a single `undefined` for them.
      resolveDisposed(Promise.all(hooks.map(hook => hook())).then(() => {}));

      return disposed;
    };

    /**
     * @param {string} dependentId
     */
    const thatDiesIfThisDies = dependentId => {
      assert(!done);
      const dependentController = provideController(dependentId);
      dependents.set(dependentId, dependentController.context);
    };

    /**
     * @param {string} dependencyId
     */
    const thisDiesIfThatDies = dependencyId => {
      const dependencyController = provideController(dependencyId);
      dependencyController.context.thatDiesIfThisDies(id);
    };

    /**
     * @param {() => void} hook
     */
    const onCancel = hook => {
      assert(!done);
      hooks.push(hook);
    };

    return {
      id,
      cancel,
      cancelled,
      disposed,
      thatDiesIfThisDies,
      thisDiesIfThatDies,
      onCancel,
    };
  };

  return makeContext;
};
