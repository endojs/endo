import { E } from '@endo/eventual-send';
import { isPromise } from '@endo/promise-kit';
import { throwLabeled } from './throw-labeled.js';

/**
 * Calls `func(...args)`, but annotating any failure error with `label`.
 *
 * If `label` is omitted or `undefined`, then this is equivalent to
 * `func(...args).
 *
 * Otherwise, if it successfully returns a non-promise, that non-promise is
 * returned.
 *
 * If it throws, rethrow a similar error whose message is
 * ```js
 * `${label}: ${originalMessage}`
 * ```
 * That way, in an error happens deep within a stack of calls to
 * `applyLabelingError`, the resulting error will show the stack of labels.
 *
 * If it returns a promise, then `applyLabelingError` cannot tell until that
 * promise settles whether it represents a success or failure. So it immediately
 * returns a new promise. If the original promise fulfills, then the
 * fulfillment is propagated to the returned promise.
 *
 * If the promise rejects with an error, then the returned promise is
 * rejected with a similar promise, prefixed with the label in that same way.
 *
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
