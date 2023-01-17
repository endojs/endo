// @ts-check
import { E } from '@endo/eventual-send';
import { isPromise } from '@endo/promise-kit';

const { fromEntries } = Object;
const { ownKeys } = Reflect;

const { details: X, quote: q, Fail } = assert;

// TODO migrate to proper home
// From the `agoric-sdk` monorepo. Moved here temporarily because the pattern
// code is migrated from `@agoric/store` to `@endo/patterns`, and depends on
// the functionality in this file, which is otherwise available only
// within the `agoric-sdk` monorepo.

/**
 * TODO as long as `@endo/pass-style` remains the proper home of the
 * `Checker` type, it probably makes most sense to move `identChecker`
 * into `@endo/pass-style` as well.
 *
 * In the `assertFoo`/`isFoo`/`checkFoo` pattern, `checkFoo` has a `check`
 * parameter of type `Checker`. `assertFoo` calls `checkFoo` passes
 * `assertChecker` as the `check` argument. `isFoo` passes `identChecker`
 * as the `check` argument. `identChecker` acts precisely like an
 * identity function, but is typed as a `Checker` to indicate its
 * intended use.
 *
 * @type {Checker}
 */
export const identChecker = (cond, _details) => cond;
harden(identChecker);

/**
 * Throws if multiple entries use the same property name. Otherwise acts
 * like `Object.fromEntries` but hardens the result.
 * Use it to protect from property names computed from user-provided data.
 *
 * @template K,V
 * @param {Iterable<[K,V]>} allEntries
 * @returns {{[k: K]: V}}
 */
export const fromUniqueEntries = allEntries => {
  const entriesArray = [...allEntries];
  const result = harden(fromEntries(entriesArray));
  if (ownKeys(result).length === entriesArray.length) {
    return result;
  }
  const names = new Set();
  for (const [name, _] of entriesArray) {
    if (names.has(name)) {
      Fail`collision on property name ${q(name)}: ${entriesArray}`;
    }
    names.add(name);
  }
  throw Fail`internal: failed to create object from unique entries`;
};
harden(fromUniqueEntries);

/**
 *
 * @param {Array<string | symbol>} leftNames
 * @param {Array<string | symbol>} rightNames
 */
export const listDifference = (leftNames, rightNames) => {
  const rightSet = new Set(rightNames);
  return leftNames.filter(name => !rightSet.has(name));
};
harden(listDifference);

/**
 * @param {Error} innerErr
 * @param {string|number} label
 * @param {ErrorConstructor=} ErrorConstructor
 * @returns {never}
 */

// Evade https://github.com/endojs/endo/issues/1450 using blank line
export const throwLabeled = (innerErr, label, ErrorConstructor = undefined) => {
  if (typeof label === 'number') {
    label = `[${label}]`;
  }
  const outerErr = assert.error(
    `${label}: ${innerErr.message}`,
    ErrorConstructor,
  );
  assert.note(outerErr, X`Caused by ${innerErr}`);
  throw outerErr;
};
harden(throwLabeled);

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
    // @ts-expect-error If result is a rejected promise, this will
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
