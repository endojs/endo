/**
 * Types of the SES environment
 * @module
 */

/* eslint-disable no-restricted-globals, vars-on-top, no-var */

// It's academically tempting to define a hardened type, but TypeScript doesn't
// strike a good balance in distinguishing "readonly" in the sense that you
// promise not to change vs "readonly" in the sense that you depend on a thing
// not changing.
// type Hardened<T> =
//   T extends number | bigint | string | null | undefined | Function ? T :
//   { readonly [P in keyof T]: Hardened<T[P]> };

// So Harden just passes the type through without modification.
// This will occasionally conflict with the type of Object.freeze.
// In those cases, we recommend casting the result of Object.freeze to the
// original thawn type, as if the signature of freeze were identical to this
// version of harden.
export type Harden = <T>(value: T) => T; // not Hardened<T>;

// TODO Somehow remove the redundancy between these type deinitions and the
// inline casts on each call to `getenv` in `lockdown.js`. Hopefully we can
// keep the type info in those casts so it is easily comparable by eye to
// the parameters of that call to `genev`.
export interface RepairOptions {
  regExpTaming?: 'safe' | 'unsafe';
  localeTaming?: 'safe' | 'unsafe';
  consoleTaming?: 'safe' | 'unsafe';
  errorTrapping?: 'platform' | 'exit' | 'abort' | 'report' | 'none';
  reporting?: 'platform' | 'console' | 'none';
  unhandledRejectionTrapping?: 'report' | 'none';
  errorTaming?: 'safe' | 'unsafe' | 'unsafe-debug';
  /**
   * @deprecated Deprecated and does nothing. In the future specifying it will be an error.
   */
  dateTaming?: 'safe' | 'unsafe';
  /**
   * @deprecated Deprecated and does nothing. In the future specifying it will be an error.
   */
  mathTaming?: 'safe' | 'unsafe';
  evalTaming?:
    | 'safe-eval'
    | 'unsafe-eval'
    | 'no-eval'
    // deprecated
    | 'safeEval'
    | 'unsafeEval'
    | 'noEval';
  stackFiltering?: 'concise' | 'omit-frames' | 'shorten-paths' | 'verbose';
  overrideTaming?: 'moderate' | 'min' | 'severe';
  overrideDebug?: Array<string>;
  domainTaming?: 'safe' | 'unsafe';
  /**
   * safe (default): do nothing.
   *
   * unsafe-ignore: make %IteratorPrototype%[@@iterator] to a funky accessor which ignores all assignments.
   */
  legacyRegeneratorRuntimeTaming?: 'safe' | 'unsafe-ignore';
  __hardenTaming__?: 'safe' | 'unsafe';
}

// Deprecated in favor of the more specific RepairOptions
export type LockdownOptions = RepairOptions;

export type RepairIntrinsics = (options?: LockdownOptions) => void;
export type HardenIntrinsics = () => void;
export type Lockdown = (options?: LockdownOptions) => void;

export type ModuleExportsNamespace = Record<string, any>;

export type __LiveExportMap__ = Record<string, [string, boolean]>;
export type __FixedExportMap__ = Record<string, [string]>;
export type __ReexportMap__ = Record<string, Array<[string, string]>>;

export interface PrecompiledModuleSource {
  imports: Array<string>;
  exports: Array<string>;
  reexports: Array<string>;
  __syncModuleProgram__: string;
  __liveExportMap__: __LiveExportMap__;
  __fixedExportMap__: __FixedExportMap__;
  __reexportMap__: __ReexportMap__;
}

export interface VirtualModuleSource {
  imports: Array<string>;
  exports: Array<string>;
  /**
   * Note that this value does _not_ contain any numeric or symbol property keys, which can theoretically be members of `exports` in a CommonJS module.
   */
  execute(
    exportsTarget: Record<string, any>,
    compartment: Compartment,
    resolvedImports: Record<string, string>,
  ): void;
}

export type ModuleSource = PrecompiledModuleSource | VirtualModuleSource;

export interface SourceModuleDescriptor {
  source: string | ModuleSource;
  specifier?: string;
  importMeta?: any;
  compartment?: Compartment; // defaults to parent
}

export interface NamespaceModuleDescriptor {
  namespace: string | ModuleExportsNamespace;
  compartment?: Compartment;
}

// Deprecated in favor of SourceModuleDescriptor,
// but beware the change in default compartment.
export interface RecordModuleDescriptor {
  specifier: string;
  record?: ModuleSource;
  importMeta?: any;
  compartment?: Compartment; // defaults to self
}

export type ModuleDescriptor =
  | SourceModuleDescriptor
  | NamespaceModuleDescriptor
  // To be deprecated:
  | RecordModuleDescriptor
  | ModuleExportsNamespace
  | VirtualModuleSource
  | PrecompiledModuleSource
  | string;

// Deprecated type aliases:
export type PrecompiledStaticModuleInterface = PrecompiledModuleSource;
export type ThirdPartyStaticModuleInterface = VirtualModuleSource;
export type RedirectStaticModuleInterface = RecordModuleDescriptor;
export type FinalStaticModuleType = ModuleSource;
export type StaticModuleType = RedirectStaticModuleInterface | ModuleSource;

export type Transform = (source: string) => string;
export type ResolveHook = (
  importSpecifier: string,
  referrerSpecifier: string,
) => string;
export type ModuleMap = Record<string, string | ModuleDescriptor>;
export type ModuleMapHook = (
  moduleSpecifier: string,
) => ModuleDescriptor | undefined;
export type ImportHook = (moduleSpecifier: string) => Promise<ModuleDescriptor>;
export type ImportNowHook = (
  moduleSpecifier: string,
) => ModuleDescriptor | undefined;
export type ImportMetaHook = (
  moduleSpecifier: string,
  importMeta: ImportMeta,
) => void;

export interface CompartmentOptions {
  name?: string;
  transforms?: Array<Transform>;
  moduleMapHook?: ModuleMapHook;
  importHook?: ImportHook;
  importNowHook?: ImportNowHook;
  importMetaHook?: ImportMetaHook;
  resolveHook?: ResolveHook;
  globals?: Map<string, any>;
  modules?: Map<string, ModuleDescriptor>;
  __shimTransforms__?: Array<Transform>;
  __noNamespaceBox__?: boolean;
  /** @deprecated */
  loadHook?: (specifier: string) => Promise<ModuleDescriptor>;
  /** @deprecated */
  loadNowHook?: (specifier: string) => ModuleDescriptor;
  __native__?: boolean;

  /**
   * If `true`, the first error encountered during module loading will be thrown immediately
   */
  noAggregateLoadErrors?: boolean;
}

export interface EvaluateOptions {
  transforms?: Array<Transform>;
  sloppyGlobalsMode?: boolean;
  __moduleShimLexicals__?: Record<string, any>;
  __evadeHtmlCommentTest__?: boolean;
  __rejectSomeDirectEvalExpressions__?: boolean;
}

/**
 * A call to the `details` template literal makes and returns a fresh details
 * token, which is a frozen empty object associated with the arguments of that
 * `details` template literal expression.
 */
export type DetailsToken = Record<any, never>;
/** Either a plain string, or made by the `details` template literal tag. */
export type Details = string | DetailsToken;

export interface AssertMakeErrorOptions {
  /**
   * Does not affect the error.name property. That remains determined by
   * the constructor. Rather, the `errorName` determines how this error is
   * identified in the causal console log's output.
   */
  errorName?: string;

  /**
   * Discloses the error that caused this one, typically from a lower
   * layer of abstraction. This is represented by a public `cause` data property
   * on the error, not a hidden annotation.
   */
  cause?: Error;

  /**
   * Normally only used when the ErrorConstuctor is `AggregateError`, to
   * represent the set of prior errors aggregated together in this error,
   * typically by `Promise.any`. But `makeError` allows it on any error.
   * This is represented by a public `errors` data property on the error,
   * not a hidden annotation.
   */
  errors?: Error[];

  /**
   * Defaults to true. If true, `makeError` will apply `sanitizeError`
   * to the error before returning it. See the comments on
   * {@link sanitizeError}.
   */
  sanitize?: boolean;
}

// TODO inline overloading

type AssertTypeofBigint = (
  specimen: any,
  typeName: 'bigint',
  details?: Details,
) => asserts specimen is bigint;
type AssertTypeofBoolean = (
  specimen: any,
  typeName: 'boolean',
  details?: Details,
) => asserts specimen is boolean;
type AssertTypeofFunction = (
  specimen: any,
  typeName: 'function',
  details?: Details,
) => asserts specimen is Function;
type AssertTypeofNumber = (
  specimen: any,
  typeName: 'number',
  details?: Details,
) => asserts specimen is number;
type AssertTypeofObject = (
  specimen: any,
  typeName: 'object',
  details?: Details,
) => asserts specimen is Record<any, any> | null;
type AssertTypeofString = (
  specimen: any,
  typeName: 'string',
  details?: Details,
) => asserts specimen is string;
type AssertTypeofSymbol = (
  specimen: any,
  typeName: 'symbol',
  details?: Details,
) => asserts specimen is symbol;
type AssertTypeofUndefined = (
  specimen: any,
  typeName: 'undefined',
  details?: Details,
) => asserts specimen is undefined;

export type AssertTypeof = AssertTypeofBigint &
  AssertTypeofBoolean &
  AssertTypeofFunction &
  AssertTypeofNumber &
  AssertTypeofObject &
  AssertTypeofString &
  AssertTypeofSymbol &
  AssertTypeofUndefined;

interface StringablePayload {
  toString(): string;
}

/**
 * TypeScript does not treat `AggregateErrorConstructor` as a subtype of
 * `ErrorConstructor`, which makes sense because their constructors
 * have incompatible signatures. However, we want to parameterize some
 * operations by any error constructor, including possible `AggregateError`.
 * So we introduce `GenericErrorConstructor` as a common supertype. Any call
 * to it to make an instance must therefore first case split on whether the
 * constructor is an AggregateErrorConstructor or a normal ErrorConstructor.
 */
export type GenericErrorConstructor =
  | ErrorConstructor
  | AggregateErrorConstructor;

/**
 * To make an `assert` which terminates some larger unit of computation
 * like a transaction, vat, or process, call `makeAssert` with a `Raise`
 * callback, where that callback actually performs that larger termination.
 * If possible, the callback should also report its `reason` parameter as
 * the alleged reason for the termination.
 */
export type Raise = (reason: Error) => void;

/**
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
 */
// Behold: recursion.
// eslint-disable-next-line no-use-before-define
export type MakeAssert = (raise?: Raise, unredacted?: boolean) => Assert;

export type BaseAssert = (
  /** The truthy/falsy value we're testing */
  flag: any,
  /** The details of what was asserted */
  details?: Details,
  /** An optional alternate error constructor to use */
  errConstructor?: GenericErrorConstructor,
  options?: AssertMakeErrorOptions,
) => asserts flag;

export interface AssertionFunctions extends BaseAssert {
  typeof: AssertTypeof;

  /**
   * The `assert.equal` method
   *
   * Assert that two values must be `Object.is`.
   */
  equal<T>(
    /** What we received */
    actual: unknown,
    /** What we wanted */
    expected: T,
    /** The details of what was asserted */
    details?: Details,
    /** An optional alternate error constructor to use */
    errConstructor?: GenericErrorConstructor,
    options?: AssertMakeErrorOptions,
  ): asserts actual is T;

  /**
   * The `assert.string` method.
   *
   * `assert.string(v)` is equivalent to `assert.typeof(v, 'string')`. We
   * special case this one because it is the most frequently used.
   *
   * Assert an expected typeof result.
   */
  string(
    specimen: any,
    /** The details of what was asserted */
    details?: Details,
  ): asserts specimen is string;

  /**
   * The `assert.fail` method.
   *
   * Fail an assertion, recording full details to the console and
   * raising an exception with a message in which `details` substitution values
   * have been redacted.
   *
   * The optional `optDetails` can be a string for backwards compatibility
   * with the nodejs assertion library.
   */
  fail(
    /** The details of what was asserted */
    details?: Details,
    /** An optional alternate error constructor to use */
    errConstructor?: GenericErrorConstructor,
    options?: AssertMakeErrorOptions,
  ): never;
}

export interface AssertionUtilities {
  /**
   * Aka the `makeError` function as imported from `@endo/errors`
   *
   * Recording unredacted details for the console.
   */
  error(
    /** The details of what was asserted */
    details?: Details,
    /** An optional alternate error constructor to use */
    errConstructor?: GenericErrorConstructor,
    options?: AssertMakeErrorOptions,
  ): Error;

  /**
   * Aka the `annotateError` function as imported from `@endo/errors`
   *
   * Annotate an error with details, potentially to be used by an
   * augmented console such as the causal console of `console.js`, to
   * provide extra information associated with logged errors.
   */
  note(error: Error, details: Details): void;

  /**
   * Use the `details` function as a template literal tag to create
   * informative error messages. The assertion functions take such messages
   * as optional arguments:
   * ```js
   * assert(sky.isBlue(), details`${sky.color} should be "blue"`);
   * ```
   * or following the normal convention to locally rename `details` to `X`
   * and `quote` to `q` like `const { details: X, quote: q } = assert;`:
   * ```js
   * assert(sky.isBlue(), X`${sky.color} should be "blue"`);
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
  details(
    template: TemplateStringsArray | string[],
    ...args: any
  ): DetailsToken;

  /**
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
  Fail(template: TemplateStringsArray | string[], ...args: any): never;

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
   * The normal convention is to locally rename `details` to `X` and `quote` to `q`
   * like `const { details: X, quote: q } = assert;`, so the above example would then be
   * ```js
   * sky.color === expectedColor || Fail`${sky.color} should be ${q(expectedColor)}`;
   * ```
   */
  quote(
    /** What to declassify */
    payload: any,
    spaces?: string | number,
  ): /** The declassified and quoted payload */ StringablePayload;

  /**
   * Embed a string directly into error details without wrapping punctuation.
   * To avoid injection attacks that exploit quoting confusion, this must NEVER
   * be used with data that is possibly attacker-controlled.
   * As a further safeguard, we fall back to quoting any input that is not a
   * string of sufficiently word-like parts separated by isolated spaces (rather
   * than throwing an exception, which could hide the original problem for which
   * explanatory details are being constructed---i.e., ``` assert.details`...` ```
   * should never be the source of a new exception, nor should an attempt to
   * render its output, although we _could_ instead decide to handle the latter
   * by inline replacement similar to that of `bestEffortStringify` for producing
   * rendered messages like `(an object) was tagged "[Unsafe bare string]"`).
   */
  bare(
    /** What to declassify */
    payload: any,
    spaces?: string | number,
  ): /** The declassified payload without quotes (beware confusion hazard) */
  StringablePayload;
}

export interface DeprecatedAssertionUtilities {
  makeAssert: MakeAssert;
}

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
 */
export type Assert = AssertionFunctions &
  AssertionUtilities &
  DeprecatedAssertionUtilities;

interface CompartmentEvaluateOptions {
  sloppyGlobalsMode?: boolean;
  __moduleShimLexicals__?: Object;
  __evadeHtmlCommentTest__?: boolean;
  __evadeImportExpressionTest__?: boolean;
  __rejectSomeDirectEvalExpressions__?: boolean;
}

declare global {
  var harden: Harden;

  var repairIntrinsics: RepairIntrinsics;
  var hardenIntrinsics: HardenIntrinsics;
  var lockdown: Lockdown;

  var assert: Assert;

  /**
   * Each Compartment constructor is a global. A host that wants to execute
   * code in a context bound to a new global creates a new compartment.
   */
  export class Compartment {
    constructor(options?: CompartmentOptions & { __options__: true });

    // Deprecated:
    constructor(
      globals?: Record<PropertyKey, any> | undefined,
      modules?: Record<string, ModuleDescriptor>,
      options?: CompartmentOptions,
    );

    get globalThis(): Record<PropertyKey, any>;

    get name(): string;

    evaluate(code: string, options?: CompartmentEvaluateOptions): any;

    import(
      specifier: string | null,
    ): Promise<{ namespace: ModuleExportsNamespace }>;

    load(specifier: string): Promise<void>;

    importNow(specifier: string): ModuleExportsNamespace;

    module(specifier: string): ModuleExportsNamespace;
  }
}
