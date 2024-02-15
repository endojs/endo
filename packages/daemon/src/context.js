// @ts-check

import { makePromiseKit } from '@endo/promise-kit';

export const makeContextMaker = ({
  controllerForFormulaIdentifier,
  provideControllerForFormulaIdentifier,
}) => {
  /**
   * @param {string} formulaIdentifier
   */
  const makeContext = formulaIdentifier => {
    let done = false;
    const { promise: cancelled, reject: rejectCancelled } =
      /** @type {import('@endo/promise-kit').PromiseKit<never>} */ (
        makePromiseKit()
      );
    const { promise: disposed, resolve: resolveDisposed } =
      /** @type {import('@endo/promise-kit').PromiseKit<void>} */ (
        makePromiseKit()
      );

    /** @type {Map<string, import('./types.js').Context>} */
    const dependents = new Map();
    /** @type {Array<() => void>} */
    const hooks = [];

    const cancel = (reason, prefix = '*') => {
      if (done) return disposed;
      done = true;
      rejectCancelled(reason || harden(new Error('Cancelled')));

      console.log(`${prefix} ${formulaIdentifier}`);

      controllerForFormulaIdentifier.delete(formulaIdentifier);
      for (const dependentContext of dependents.values()) {
        dependentContext.cancel(reason, ` ${prefix}`);
      }
      dependents.clear();

      // Execute all cancellation hooks and resolve a single `undefined` for them.
      resolveDisposed(Promise.all(hooks.map(hook => hook())).then(() => {}));

      return disposed;
    };

    const thatDiesIfThisDies = dependentFormulaIdentifier => {
      assert(!done);
      const dependentController = provideControllerForFormulaIdentifier(
        dependentFormulaIdentifier,
      );
      dependents.set(dependentFormulaIdentifier, dependentController.context);
    };

    const thisDiesIfThatDies = dependencyIdentifier => {
      const dependencyController =
        provideControllerForFormulaIdentifier(dependencyIdentifier);
      dependencyController.context.thatDiesIfThisDies(formulaIdentifier);
    };

    /**
     * @param {() => void} hook
     */
    const onCancel = hook => {
      assert(!done);
      hooks.push(hook);
    };

    return {
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
