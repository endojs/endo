/// <reference types="ses"/>

/**
 * @typedef {{ NOTE: 'ERROR_NOTE:', MESSAGE: 'ERROR_MESSAGE:' }} ErrorInfo
 */

/**
 * @typedef {ErrorInfo[keyof ErrorInfo]} ErrorInfoKind
 */

/**
 * @callback GetLogArgs
 * @returns {readonly any[]}
 */

/**
 * @callback RememberErrorInfo
 * @param {Error} error
 * @param {ErrorInfoKind} kind
 * @param {GetLogArgs} getLogArgs
 * @returns {void}
 */

// Type all the overloads of the assertTypeof function.
// There may eventually be a better way to do this, but
// thems the breaks with Typescript 4.0.
/**
 * @callback AssertTypeofBigint
 * @param {any} specimen
 * @param {'bigint'} typename
 * @param {Details} [optDetails]
 * @returns {asserts specimen is bigint}
 *
 * @callback AssertTypeofBoolean
 * @param {any} specimen
 * @param {'boolean'} typename
 * @param {Details} [optDetails]
 * @returns {asserts specimen is boolean}
 *
 * @callback AssertTypeofFunction
 * @param {any} specimen
 * @param {'function'} typename
 * @param {Details} [optDetails]
 * @returns {asserts specimen is Function}
 *
 * @callback AssertTypeofNumber
 * @param {any} specimen
 * @param {'number'} typename
 * @param {Details} [optDetails]
 * @returns {asserts specimen is number}
 *
 * @callback AssertTypeofObject
 * @param {any} specimen
 * @param {'object'} typename
 * @param {Details} [optDetails]
 * @returns {asserts specimen is object}
 *
 * @callback AssertTypeofString
 * @param {any} specimen
 * @param {'string'} typename
 * @param {Details} [optDetails]
 * @returns {asserts specimen is string}
 *
 * @callback AssertTypeofSymbol
 * @param {any} specimen
 * @param {'symbol'} typename
 * @param {Details} [optDetails]
 * @returns {asserts specimen is symbol}
 *
 * @callback AssertTypeofUndefined
 * @param {any} specimen
 * @param {'undefined'} typename
 * @param {Details} [optDetails]
 * @returns {asserts specimen is undefined}
 */

/**
 * @typedef {AssertTypeofBigint & AssertTypeofBoolean & AssertTypeofFunction & AssertTypeofNumber & AssertTypeofObject & AssertTypeofString & AssertTypeofSymbol & AssertTypeofUndefined} AssertTypeof
 */
