// @ts-check

import { makePromiseKit } from '@endo/promise-kit';

export const makeTerminatorMaker = ({
  controllerForFormulaIdentifier,
  provideControllerForFormulaIdentifier,
}) => {
  /**
   * @param {string} formulaIdentifier
   */
  const makeTerminator = formulaIdentifier => {
    let terminating = false;
    const { promise: terminated, resolve: resolveTerminated } =
      /** @type {import('@endo/promise-kit').PromiseKit<void>} */ (
        makePromiseKit()
      );

    /** @type {Map<string, import('./types.js').Terminator>} */
    const dependents = new Map();
    /** @type {Array<() => void>} */
    const hooks = [];

    const terminate = (prefix = '*') => {
      if (terminating) return terminated;
      terminating = true;

      console.log(`${prefix} ${formulaIdentifier}`);

      controllerForFormulaIdentifier.delete(formulaIdentifier);
      for (const dependentTerminator of dependents.values()) {
        dependentTerminator.terminate(` ${prefix}`);
      }
      dependents.clear();

      resolveTerminated(Promise.all(hooks.map(hook => hook())).then(() => {}));

      return terminated;
    };

    const thatDiesIfThisDies = dependentFormulaIdentifier => {
      assert(!terminating);
      const dependentController = provideControllerForFormulaIdentifier(
        dependentFormulaIdentifier,
      );
      dependents.set(
        dependentFormulaIdentifier,
        dependentController.terminator,
      );
    };

    const thisDiesIfThatDies = dependencyIdentifier => {
      const dependencyController =
        provideControllerForFormulaIdentifier(dependencyIdentifier);
      dependencyController.terminator.thatDiesIfThisDies(formulaIdentifier);
    };

    /**
     * @param {() => void} hook
     */
    const onTerminate = hook => {
      assert(!terminating);
      hooks.push(hook);
    };

    return {
      terminate,
      terminated,
      thatDiesIfThisDies,
      thisDiesIfThatDies,
      onTerminate,
    };
  };

  return makeTerminator;
};
