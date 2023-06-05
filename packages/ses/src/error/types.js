// @ts-check

/**
 * @callback BaseAssert
 * The `assert` function itself.
 *
 * @param {*} flag The truthy/falsy value
 * @param {Details=} optDetails The details to throw
 * @param {ErrorConstructor=} ErrorConstructor An optional alternate error
 * constructor to use.
 * @returns {asserts flag}
 */

/**
 * @typedef {object} AssertMakeErrorOptions
 * @property {string=} errorName
 */

/**
 * @callback AssertMakeError
 *
 * The `assert.error` method, recording details for the console.
 *
 * The optional `optDetails` can be a string.
 * @param {Details=} optDetails The details of what was asserted
 * @param {ErrorConstructor=} ErrorConstructor An optional alternate error
 * constructor to use.
 * @param {AssertMakeErrorOptions=} options
 * @returns {Error}
 */

/**
 * @callback AssertFail
 *
 * The `assert.fail` method.
 *
 * Fail an assertion, recording full details to the console and
 * raising an exception with a message in which `details` substitution values
 * have been redacted.
 *
 * The optional `optDetails` can be a string for backwards compatibility
 * with the nodejs assertion library.
 * @param {Details=} optDetails The details of what was asserted
 * @param {ErrorConstructor=} ErrorConstructor An optional alternate error
 * constructor to use.
 * @returns {never}
 */

/**
 * @callback AssertEqual
 * The `assert.equal` method
 *
 * Assert that two values must be `Object.is`.
 * @param {*} actual The value we received
 * @param {*} expected What we wanted
 * @param {Details=} optDetails The details to throw
 * @param {ErrorConstructor=} ErrorConstructor An optional alternate error
 * constructor to use.
 * @returns {void}
 */

// Type all the overloads of the assertTypeof function.
// There may eventually be a better way to do this, but
// thems the breaks with Typescript 4.0.
/**
 * @callback AssertTypeofBigint
 * @param {any} specimen
 * @param {'bigint'} typename
 * @param {Details=} optDetails
 * @returns {asserts specimen is bigint}
 */

/**
 * @callback AssertTypeofBoolean
 * @param {any} specimen
 * @param {'boolean'} typename
 * @param {Details=} optDetails
 * @returns {asserts specimen is boolean}
 */

/**
 * @callback AssertTypeofFunction
 * @param {any} specimen
 * @param {'function'} typename
 * @param {Details=} optDetails
 * @returns {asserts specimen is Function}
 */

/**
 * @callback AssertTypeofNumber
 * @param {any} specimen
 * @param {'number'} typename
 * @param {Details=} optDetails
 * @returns {asserts specimen is number}
 */

/**
 * @callback AssertTypeofObject
 * @param {any} specimen
 * @param {'object'} typename
 * @param {Details=} optDetails
 * @returns {asserts specimen is Record<any, any> | null}
 */

/**
 * @callback AssertTypeofString
 * @param {any} specimen
 * @param {'string'} typename
 * @param {Details=} optDetails
 * @returns {asserts specimen is string}
 */

/**
 * @callback AssertTypeofSymbol
 * @param {any} specimen
 * @param {'symbol'} typename
 * @param {Details=} optDetails
 * @returns {asserts specimen is symbol}
 */

/**
 * @callback AssertTypeofUndefined
 * @param {any} specimen
 * @param {'undefined'} typename
 * @param {Details=} optDetails
 * @returns {asserts specimen is undefined}
 */

/**
 * The `assert.typeof` method
 *
 * @typedef {AssertTypeofBigint & AssertTypeofBoolean & AssertTypeofFunction & AssertTypeofNumber & AssertTypeofObject & AssertTypeofString & AssertTypeofSymbol & AssertTypeofUndefined} AssertTypeof
 */

/**
 * @callback AssertString
 * The `assert.string` method.
 *
 * `assert.string(v)` is equivalent to `assert.typeof(v, 'string')`. We
 * special case this one because it is the most frequently used.
 *
 * Assert an expected typeof result.
 * @param {any} specimen The value to get the typeof
 * @param {Details=} optDetails The details to throw
 * @returns {asserts specimen is string}
 */

/**
 * @callback AssertNote
 * The `assert.note` method.
 *
 * Annotate an error with details, potentially to be used by an
 * augmented console such as the causal console of `console.js`, to
 * provide extra information associated with logged errors.
 *
 * @param {Error} error
 * @param {Details} detailsNote
 * @returns {void}
 */

// /////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {{}} DetailsToken
 * A call to the `details` template literal makes and returns a fresh details
 * token, which is a frozen empty object associated with the arguments of that
 * `details` template literal expression.
 */

/**
 * @typedef {string | DetailsToken} Details
 * Either a plain string, or made by the `details` template literal tag.
 */

/**
 * @typedef {object} StringablePayload
 * Holds the payload passed to quote so that its printed form is visible.
 * @property {() => string} toString How to print the payload
 */

/**
 * To "declassify" and quote a substitution value used in a
 * ``` details`...` ``` template literal, enclose that substitution expression
 * in a call to `quote`. This makes the value appear quoted
 * (as if with `JSON.stringify`) in the message of the thrown error. The
 * payload itself is still passed unquoted to the console as it would be
 * without `quote`.
 *
 * For example, the following will reveal the expected sky color, but not the
 * actual incorrect sky color, in the thrown error's message:
 * ```js
 * sky.color === expectedColor || Fail`${sky.color} should be ${quote(expectedColor)}`;
 * ```
 *
 * // TODO Update SES-shim to new convention, where `details` is
 * // renamed to `X` rather than `d`.
 * The normal convention is to locally rename `details` to `d` and `quote` to `q`
 * like `const { details: d, quote: q } = assert;`, so the above example would then be
 * ```js
 * sky.color === expectedColor || Fail`${sky.color} should be ${q(expectedColor)}`;
 * ```
 *
 * @callback AssertQuote
 * @param {*} payload What to declassify
 * @param {(string|number)=} spaces
 * @returns {StringablePayload} The declassified payload
 */

/**
 * @callback Raise
 *
 * To make an `assert` which terminates some larger unit of computation
 * like a transaction, vat, or process, call `makeAssert` with a `Raise`
 * callback, where that callback actually performs that larger termination.
 * If possible, the callback should also report its `reason` parameter as
 * the alleged reason for the termination.
 *
 * @param {Error} reason
 */

/**
 * @callback MakeAssert
 *
 * Makes and returns an `assert` function object that shares the bookkeeping
 * state defined by this module with other `assert` function objects made by
 * `makeAssert`. This state is per-module-instance and is exposed by the
 * `loggedErrorHandler` above. We refer to `assert` as a "function object"
 * because it can be called directly as a function, but also has methods that
 * can be called.
 *
 * If `optRaise` is provided, the returned `assert` function object will call
 * `optRaise(reason)` before throwing the error. This enables `optRaise` to
 * engage in even more violent termination behavior, like terminating the vat,
 * that prevents execution from reaching the following throw. However, if
 * `optRaise` returns normally, which would be unusual, the throw following
 * `optRaise(reason)` would still happen.
 *
 * @param {Raise=} optRaise
 * @param {boolean=} unredacted
 * @returns {Assert}
 */

/**
 * @typedef {(template: TemplateStringsArray | string[], ...args: any) => DetailsToken} DetailsTag
 *
 * Use the `details` function as a template literal tag to create
 * informative error messages. The assertion functions take such messages
 * as optional arguments:
 * ```js
 * assert(sky.isBlue(), details`${sky.color} should be "blue"`);
 * ```
 * // TODO Update SES-shim to new convention, where `details` is
 * // renamed to `X` rather than `d`.
 * or following the normal convention to locally rename `details` to `d`
 * and `quote` to `q` like `const { details: d, quote: q } = assert;`:
 * ```js
 * assert(sky.isBlue(), d`${sky.color} should be "blue"`);
 * ```
 * However, note that in most cases it is preferable to instead use the `Fail`
 * template literal tag (which has the same input signature as `details`
 * but automatically creates and throws an error):
 * ```js
 * sky.isBlue() || Fail`${sky.color} should be "blue"`;
 * ```
 *
 * The details template tag returns a `DetailsToken` object that can print
 * itself with the formatted message in two ways.
 * It will report full details to the console, but
 * mask embedded substitution values with their typeof information in the thrown error
 * to prevent revealing secrets up the exceptional path. In the example
 * above, the thrown error may reveal only that `sky.color` is a string,
 * whereas the same diagnostic printed to the console reveals that the
 * sky was green. This masking can be disabled for an individual substitution value
 * using `quote`.
 *
 * The `raw` property of an input template array is ignored, so a simple
 * array of strings may be provided directly.
 */

/**
 * @typedef {(template: TemplateStringsArray | string[], ...args: any) => never} FailTag
 *
 * Use the `Fail` function as a template literal tag to efficiently
 * create and throw a `details`-style error only when a condition is not satisfied.
 * ```js
 * condition || Fail`...complaint...`;
 * ```
 * This avoids the overhead of creating usually-unnecessary errors like
 * ```js
 * assert(condition, details`...complaint...`);
 * ```
 * while improving readability over alternatives like
 * ```js
 * condition || assert.fail(details`...complaint...`);
 * ```
 *
 * However, due to current weakness in TypeScript, static reasoning
 * is less powerful with the `||` patterns than with an `assert` call.
 * Until/unless https://github.com/microsoft/TypeScript/issues/51426 is fixed,
 * for `||`-style assertions where this loss of static reasoning is a problem,
 * instead express the assertion as
 * ```js
 *   if (!condition) {
 *     Fail`...complaint...`;
 *   }
 * ```
 * or, if needed,
 * ```js
 *   if (!condition) {
 *     // `throw` is noop since `Fail` throws, but it improves static analysis
 *     throw Fail`...complaint...`;
 *   }
 * ```
 */

/**
 * assert that expr is truthy, with an optional details to describe
 * the assertion. It is a tagged template literal like
 * ```js
 * assert(expr, details`....`);`
 * ```
 *
 * The literal portions of the template are assumed non-sensitive, as
 * are the `typeof` types of the substitution values. These are
 * assembled into the thrown error message. The actual contents of the
 * substitution values are assumed sensitive, to be revealed to
 * the console only. We assume only the virtual platform's owner can read
 * what is written to the console, where the owner is in a privileged
 * position over computation running on that platform.
 *
 * The optional `optDetails` can be a string for backwards compatibility
 * with the nodejs assertion library.
 *
 * @typedef { BaseAssert & {
 *   typeof: AssertTypeof,
 *   error: AssertMakeError,
 *   fail: AssertFail,
 *   equal: AssertEqual,
 *   string: AssertString,
 *   note: AssertNote,
 *   details: DetailsTag,
 *   Fail: FailTag,
 *   quote: AssertQuote,
 *   bare: AssertQuote,
 *   makeAssert: MakeAssert,
 * } } Assert
 */

// /////////////////////////////////////////////////////////////////////////////

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
 * @param {string=} topic
 * @returns {VirtualConsole}
 */
