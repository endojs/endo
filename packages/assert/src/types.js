/// <reference types="ses"/>

/**
 * A LogRecord represents an invocation of a given log level of a console
 * with a given set of arguments. We call these `outerArgs` because they may
 * contain an encoding of a CauseRecord containing `cause` -- to be
 * processed specially when recognized.
 *
 * @typedef {Object} LogRecord
 * @property {string} level
 * @property {readonly any[]} outerArgs
 */

/**
 * A CauseRecord is an allegation that the log `level` together with the
 * `cause` represent one of the causes of `error`. These are called
 * `cause` because the CauseRecord may be encoded into a LogRecord.
 *
 * @typedef {Object} CauseRecord
 * @property {string} level
 * @property {readonly any[]} cause
 * @property {Error} error
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
