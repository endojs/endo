// @ts-check

import harden from '@endo/harden';
import { makePromiseKit } from '@endo/promise-kit';

/** @import { PromiseKit } from '@endo/promise-kit' */
/** @import { Context, FormulaIdentifier } from './types.js' */

/**
 * Creates a factory function for generating `Context` objects.
 *
 * @param {object} args
 * @param {Map<FormulaIdentifier, { context: Context }>} args.controllerForId
 * @param {(id: FormulaIdentifier) => { context: Context }} args.provideController
 * @param {(id: FormulaIdentifier) => string | undefined} args.getFormulaType
 */
export const makeContextMaker = ({
  controllerForId,
  provideController,
  getFormulaType,
}) => {
  /**
   * Creates a new lifecycle-managed context for a specific guest formula.
   *
   * This context tracks the formula's status, handles cancellation propagation
   * to dependents, and manages cleanup hooks.
   *
   * @param {FormulaIdentifier} id - The unique identifier for the formula.
   */
  const makeContext = id => {
    let done = false;
    const { promise: cancelled, reject: rejectCancelled } =
      /** @type {PromiseKit<never>} */ (makePromiseKit());
    const { promise: disposed, resolve: resolveDisposed } =
      /** @type {PromiseKit<void>} */ (makePromiseKit());
    cancelled.catch(() => {});

    /** @type {Map<FormulaIdentifier, Context>} */
    const dependents = new Map();
    /** @type {Array<() => void>} */
    const hooks = [];

    /**
     * Triggers cancellation of this context and all registered dependents.
     *
     * @param {Error} reason - The error or reason for cancellation.
     * @param {string} [prefix] - A prefix for console logging, useful for indentation.
     */
    const cancel = (reason, prefix = '*') => {
      if (done) return disposed;
      done = true;
      rejectCancelled(reason || harden(new Error('Cancelled')));

      const formulaType = getFormulaType(id) || '?';
      console.log(
        `${prefix} ${id} (${formulaType}) REASON: ${reason?.message || reason}`,
      );

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
     * Registers a dependent formula that will be cancelled if this one is cancelled.
     *
     * @param {FormulaIdentifier} dependentId - The identifier of the dependent formula.
     */
    const thatDiesIfThisDies = dependentId => {
      if (done) {
        // The formula is already cancelled.  The dependents map has been
        // cleared, so there is no way to register a new dependent for
        // future cascaded cancellation.  The caller can still observe
        // cancellation through the `cancelled` promise.
        return;
      }
      const dependentController = provideController(dependentId);
      dependents.set(dependentId, dependentController.context);
    };

    /**
     * Registers this context as a dependent of the formula with the given identifier.
     *
     * @param {FormulaIdentifier} dependencyId - The identifier of the formula this context depends on.
     */
    const thisDiesIfThatDies = dependencyId => {
      const dependencyController = provideController(dependencyId);
      dependencyController.context.thatDiesIfThisDies(id);
    };

    /**
     * Registers a function to be called when this context is cancelled.
     *
     * @param {() => void} hook - A function with no parameters to execute during disposal.
     */
    const onCancel = hook => {
      if (done) {
        // Already cancelled – hooks have already fired.
        return;
      }
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
