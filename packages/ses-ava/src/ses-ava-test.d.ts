/**
 * TODO For some reason, the following declaration (with "at-" as "@")
 * doesn't work well for either TS or typedoc. For TS it seems to type
 * `VirtualConsole` as `any` in a vscode hover. For typedoc it results in
 * errors.
 *
 * at-typedef {import('ses/console-tools.js').VirtualConsole} VirtualConsole
 *
 * so instead, for now, we just declare it as `any`. TODO is to repair this.
 */
export type VirtualConsole = any;
/**
 * The ava `test` function takes a callback argument of the form
 * `t => {...}` or `async t => {...}`.
 * If the outcome of this function indicates an error, either
 * by throwing or by eventually rejecting a returned promise, ava does its
 * own console-like display of this error and its stacktrace.
 * However, it does not use the SES `console` and so misses out on features
 * such as unredaction.
 *
 * To use this package, a test file replaces the line
 * ```js
 * import test from 'ava';
 * ```
 * with
 * ```js
 * import { wrapTest } from '@endo/ses-ava';
 * import rawTest from 'ava';
 *
 * const test = wrapTest(rawTest);
 * ```
 * Then the calls to `test` in the rest of the test file will act like they
 * used to, except that, if a test fails because the test function (the
 * callback argument to `test`) throws or returns a promise
 * that eventually rejects, the error is first sent to the logger
 * (which defaults to using the SES-aware `console.error`)
 * before propagating into `rawTest`.
 *
 * @template {import('ava').TestFn} [T=import('ava').TestFn] ava `test`
 * @param {T} avaTest
 * @returns {T}
 */
export function wrapTest<T extends import("ava").TestFn<unknown> = import("ava").TestFn<unknown>>(avaTest: T): T;
//# sourceMappingURL=ses-ava-test.d.ts.map