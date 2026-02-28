// @ts-check

/**
 * @import {VirtualConsole} from './types.js'
 */

/**
 * @typedef {readonly any[]} LogArgs
 *
 * This is an array suitable to be used as arguments of a console
 * level message *after* the format string argument. It is the result of
 * a `details` template string and consists of alternating literal strings
 * and substitution values, starting with a literal string. At least that
 * first literal string is always present.
 */

/**
 * @callback NoteCallback
 *
 * @param {Error} error
 * @param {LogArgs} noteLogArgs
 * @returns {void}
 */

/**
 * @callback GetStackString
 * @param {Error} error
 * @returns {string=}
 */

/**
 * @typedef {object} LoggedErrorHandler
 *
 * Used to parameterize `makeCausalConsole` to give it access to potentially
 * hidden information to augment the logging of errors.
 *
 * @property {GetStackString} getStackString
 * @property {(error: Error) => string} tagError
 * @property {() => void} resetErrorTagNum for debugging purposes only
 * @property {(error: Error) => (LogArgs | undefined)} getMessageLogArgs
 * @property {(error: Error) => (LogArgs | undefined)} takeMessageLogArgs
 * @property {(error: Error, callback?: NoteCallback) => LogArgs[] } takeNoteLogArgsArray
 */

// /////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {readonly [string, ...any[]]} LogRecord
 */

/**
 * @typedef {object} LoggingConsoleKit
 * @property {VirtualConsole} loggingConsole
 * @property {() => readonly LogRecord[]} takeLog
 */

/**
 * @typedef {object} MakeLoggingConsoleKitOptions
 * @property {boolean=} shouldResetForDebugging
 */

/**
 * @callback MakeLoggingConsoleKit
 *
 * A logging console just accumulates the contents of all permitted calls,
 * making them available to callers of `takeLog()`. Calling `takeLog()`
 * consumes these, so later calls to `takeLog()` will only provide a log of
 * calls that have happened since then.
 *
 * @param {LoggedErrorHandler} loggedErrorHandler
 * @param {MakeLoggingConsoleKitOptions=} options
 * @returns {LoggingConsoleKit}
 */

/**
 * @typedef {{
 *   NOTE: 'ERROR_NOTE:',
 *   MESSAGE: 'ERROR_MESSAGE:',
 *   CAUSE: 'cause:',
 *   ERRORS: 'errors:',
 * }} ErrorInfo
 */

/**
 * @typedef {ErrorInfo[keyof ErrorInfo]} ErrorInfoKind
 */

/**
 * @callback MakeCausalConsole
 *
 * Makes a causal console wrapper of a `baseConsole`, where the causal console
 * calls methods of the `loggedErrorHandler` to customize how it handles logged
 * errors.
 *
 * @param {VirtualConsole | undefined} baseConsole
 * @param {LoggedErrorHandler} loggedErrorHandler
 * @returns {VirtualConsole | undefined}
 */
