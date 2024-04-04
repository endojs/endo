export function hasOwnPropertyOf(obj: any, prop: any): any;
export function isObject(val: any): boolean;
export function isTypedArray(object: unknown): boolean;
export const PASS_STYLE: unique symbol;
export function canBeMethod(func: any): boolean;
/**
 * Below we have a series of predicate functions and their (curried) assertion
 * functions. The semantics of the assertion function is just to assert that
 * the corresponding predicate function would have returned true. But it
 * reproduces the internal tests so failures can give a better error message.
 *
 * @type {Checker}
 */
export const assertChecker: Checker;
export function checkNormalProperty(candidate: object, propertyName: string | number | symbol, shouldBeEnumerable: boolean, check?: Checker | undefined): boolean;
export function getTag(tagRecord: any): any;
export function checkPassStyle(obj: any, expectedPassStyle: any, check: any): any;
/**
 * @param {{ [PASS_STYLE]: string }} tagRecord
 * @param {PassStyle} passStyle
 * @param {Checker} [check]
 * @returns {boolean}
 */
export function checkTagRecord(tagRecord: {
    [PASS_STYLE]: string;
}, passStyle: PassStyle, check?: Checker | undefined): boolean;
/**
 * @param {{ [PASS_STYLE]: string }} tagRecord
 * @param {PassStyle} passStyle
 * @param {Checker} [check]
 * @returns {boolean}
 */
export function checkFunctionTagRecord(tagRecord: {
    [PASS_STYLE]: string;
}, passStyle: PassStyle, check?: Checker | undefined): boolean;
import type { Checker } from './types.js';
import type { PassStyle } from './types.js';
//# sourceMappingURL=passStyle-helpers.d.ts.map