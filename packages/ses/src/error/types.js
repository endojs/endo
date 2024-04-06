// @ts-check

/** @import {GenericErrorConstructor, AssertMakeErrorOptions, DetailsToken, StringablePayload} from '../../types.js' */

/**
 * @typedef {object} VirtualConsole
 * @property {Console['debug']} debug
 * @property {Console['log']} log
 * @property {Console['info']} info
 * @property {Console['warn']} warn
 * @property {Console['error']} error
 *
 * @property {Console['trace']} trace
 * @property {Console['dirxml']} dirxml
 * @property {Console['group']} group
 * @property {Console['groupCollapsed']} groupCollapsed
 *
 * @property {Console['assert']} assert
 * @property {Console['timeLog']} timeLog
 *
 * @property {Console['clear']} clear
 * @property {Console['count']} count
 * @property {Console['countReset']} countReset
 * @property {Console['dir']} dir
 * @property {Console['groupEnd']} groupEnd
 *
 * @property {Console['table']} table
 * @property {Console['time']} time
 * @property {Console['timeEnd']} timeEnd
 * @property {Console['timeStamp']} timeStamp
 */

/* This is deliberately *not* JSDoc, it is a regular comment.
 *
 * TODO: We'd like to add the following properties to the above
 * VirtualConsole, but they currently cause conflicts where
 * some Typescript implementations don't have these properties
 * on the Console type.
 *
 * @property {Console['profile']} profile
 * @property {Console['profileEnd']} profileEnd
 */

/**
 * @typedef {'debug' | 'log' | 'info' | 'warn' | 'error'} LogSeverity
 */

/**
 * @typedef ConsoleFilter
 * @property {(severity: LogSeverity) => boolean} canLog
 */

/**
 * @callback FilterConsole
 * @param {VirtualConsole} baseConsole
 * @param {ConsoleFilter} filter
 * @param {string} [topic]
 * @returns {VirtualConsole}
 */
