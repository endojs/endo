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
export const identChecker: Checker;
export function fromUniqueEntries<K, V>(allEntries: Iterable<[K, V]>): {};
export function objectMap<O extends Record<string, any>, R>(original: O, mapFn: (value: O[keyof O], key: keyof O) => R): Record<keyof O, R>;
export function listDifference(leftNames: Array<string | symbol>, rightNames: Array<string | symbol>): (string | symbol)[];
export function throwLabeled(innerErr: Error, label: string | number, ErrorConstructor?: ErrorConstructor | undefined): never;
export function applyLabelingError<A, R>(func: (...args: A[]) => R, args: A[], label?: string | number | undefined): R;
export function makeIterator<T = unknown>(next: () => IteratorResult<T, any>): IterableIterator<T>;
export function makeArrayIterator<T = unknown>(arr: T[]): IterableIterator<T>;
export type Checker = import('@endo/marshal').Checker;
//# sourceMappingURL=utils.d.ts.map