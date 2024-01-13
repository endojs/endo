import { E } from '@endo/eventual-send';
import { isPromise } from '@endo/promise-kit';
import { throwLabeled } from './throw-labeled.js';

/**
 * @template A,R
 * @param {(...args: A[]) => R} func
 * @param {A[]} args
 * @param {string|number} [label]
 * @returns {R}
 */
export const applyLabelingError = (func, args, label = undefined) => {
  if (label === undefined) {
    return func(...args);
  }
  let result;
  try {
    result = func(...args);
  } catch (err) {
    throwLabeled(err, label);
  }
  if (isPromise(result)) {
    // Cannot be at-ts-expect-error because there is no type error locally.
    // Rather, a type error only as imported into exo.
    // @ts-ignore If result is a rejected promise, this will
    // return a promise with a different rejection reason. But this
    // confuses TypeScript because it types that case as `Promise<never>`
    // which is cool for a promise that will never fulfll.
    // But TypeScript doesn't understand that this will only happen
    // when `result` was a rejected promise. In only this case `R`
    // should already allow `Promise<never>` as a subtype.
    return E.when(result, undefined, reason => throwLabeled(reason, label));
  } else {
    return result;
  }
};
harden(applyLabelingError);
