// TODO Complete migration of Checker type from @endo/pass-style to @endo/common
// by having @endo/pass-style, and everyone else who needs it, import it from
// @endo/common.
/**
 * @callback Checker
 * Internal to a useful pattern for writing checking logic
 * (a "checkFoo" function) that can be used to implement a predicate
 * (an "isFoo" function) or a validator (an "assertFoo" function).
 *
 *    * A predicate ideally only returns `true` or `false` and rarely throws.
 *    * A validator throws an informative diagnostic when the predicate
 *      would have returned `false`, and simply returns `undefined` normally
 *      when the predicate would have returned `true`.
 *    * The internal checking function that they share is parameterized by a
 *      `Checker` that determines how to proceed with a failure condition.
 *      Predicates pass in an identity function as checker. Validators
 *      pass in `assertChecker` which is a trivial wrapper around `assert`.
 *
 * See the various uses for good examples.
 * @param {boolean} cond
 * @param {import('ses').Details} [details]
 * @returns {boolean}
 */

/**
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
