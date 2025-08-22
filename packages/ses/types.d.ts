/**
 * Types of the SES environment
 * @module
 */

import '@endo/immutable-arraybuffer/shim.js';

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

interface Stringable {
  toString(): string;
}

/** @deprecated */
type StringPayload = Stringable;

/**
 * A call to the {@link details} template literal makes and returns a fresh
 * DetailsToken, which is a frozen empty object associated with the arguments of
 * that expression.
 */
export type DetailsToken = Record<any, never>;
/**
 * A plain string, or a {@link DetailsToken} from the {@link details} template
 * literal tag.
 */
export type Details = string | DetailsToken;

export interface AssertMakeErrorOptions {
  /**
   * Does not affect the error.name property. That remains determined by
   * the constructor. Rather, the `errorName` determines how this error is
   * identified in an associated console's output.
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
 * Makes and returns an `assert` function object that shares the
 * per-module-instance bookkeeping state defined by this module with other
 * `assert` function objects made by `makeAssert`. We refer to `assert` as a
 * "function object" because it can be called directly as a function, but also
 * has callable methods of its own.
 *
 * If `raise` is provided, the returned `assert` function object will call
 * `raise(reason)` before throwing an assertion-failure error. This enables
 * `raise` to engage in even more violent termination behavior, like process
 * termination, that prevents execution from reaching the following throw.
 * However, if `raise(reason)` returns normally, which would be unusual, that
 * throw still happens.
 */
// eslint-disable-next-line no-use-before-define
export type MakeAssert = (raise?: Raise, unredacted?: boolean) => Assert;

export type BaseAssert = (
  /** The condition whose truthiness is being asserted */
  condition: any,
  /** The details associated with assertion failure (falsy condition) */
  details?: Details,
  /** An optional alternate error constructor to use */
  errConstructor?: GenericErrorConstructor,
  options?: AssertMakeErrorOptions,
) => asserts condition;

export interface AssertionFunctions extends BaseAssert {
  typeof: AssertTypeof;

  /**
   * Assert that two values are the same as observed by `Object.is`.
   */
  equal<T>(
    /** What we received */
    actual: unknown,
    /** What we wanted */
    expected: T,
    /** The details associated with assertion failure (`Object.is` returning false) */
    details?: Details,
    /** An optional alternate error constructor to use */
    errConstructor?: GenericErrorConstructor,
    options?: AssertMakeErrorOptions,
  ): asserts actual is T;

  /**
   * Assert that a value is a primitive string.
   * `assert.string(v)` is equivalent to `assert.typeof(v, 'string')`. We
   * special case this one because it is the most frequently used.
   */
  string(
    specimen: any,
    /** The details of what was asserted */
    details?: Details,
  ): asserts specimen is string;

  /**
   * Fail an assertion, raising an exception with a `message` in which unquoted
   * `details` substitution values may have been redacted into `typeof` types
   * but are still available for logging to an associated console.
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
   * Create an error with a `message` in which unquoted {@link details}
   * substitution values may have been redacted into lossy `typeof` output but
   * are still available for logging to an associated console.
   */
  makeError(
    /** The details of what was asserted */
    details?: Details,
    /** An optional alternate error constructor to use */
    errConstructor?: GenericErrorConstructor,
    options?: AssertMakeErrorOptions,
  ): Error;

  /**
   * Associate `details` with `error`, potentially to be logged by an associated
   * console for providing extra information about the error.
   */
  note(error: Error, details: Details): void;

  /**
   * Use as a template literal tag to create an opaque {@link DetailsToken} for
   * use with other assertion functions that might redact unquoted substitution
   * values (i.e., those that are not output from the {@link quote} function)
   * into lossy `typeof` output but still preserve them for logging to an
   * associated console.
   *
   * The normal convention is to locally rename `details` to `X` like
   * `const { details: X, quote: q, Fail } = assert;`.
   * However, note that in most cases it is preferable to instead use the `Fail`
   * template literal tag (which has the same input signature but automatically
   * creates and throws an error):
   * ```js
   * sky.isBlue() || Fail`${sky.color} should be "blue"`;
   * ```
   *
   * The `raw` property of an input template array is ignored, so a simple
   * array of strings may be provided directly.
   */
  details(
    template: TemplateStringsArray | string[],
    ...args: any
  ): DetailsToken;

  /**
   * Use as a template literal tag to create and throw an error in whose
   * `message` unquoted substitution values (i.e., those that are not output
   * from the {@link quote} function) may have been redacted into lossy `typeof`
   * output but are still available for logging to an associated console.
   *
   * For example, using the normal convention to locally rename properties like
   * `const { quote: q, Fail } = assert;`:
   * ```js
   * sky.isBlue() || Fail`${sky.color} should be "blue"`;
   * ```
   *
   * This `||` pattern saves the cost of creating {@link DetailsToken} and/or
   * error instances when the asserted condition holds, but can weaken
   * TypeScript static reasoning due to
   * https://github.com/microsoft/TypeScript/issues/51426 . Where this is a
   * problem, instead express the assertion as
   * ```js
   * if (!sky.isBlue()) {
   *   // This `throw` does not affect runtime behavior since `Fail` throws, but
   *   // might be needed to improve static analysis.
   *   throw Fail`${sky.color} should be "blue"`;
   * }
   * ```
   *
   * The `raw` property of an input template array is ignored, so a simple
   * array of strings may be provided directly.
   */
  Fail(template: TemplateStringsArray | string[], ...args: any): never;

  /**
   * Wrap a value such that its use as a substitution value in a template
   * literal tagged with {@link details} or {@link Fail} will result in it
   * appearing quoted (in a way similar to but more general than
   * `JSON.stringify`) rather than redacted in the `message` of errors based on
   * the resulting {@link DetailsToken}.
   *
   * This does not affect representation in output of an associated console,
   * which still logs the value as it would without `quote`, but *does* reveal
   * it to functions in the propagation path of such errors.
   *
   * For example, the following will reveal the expected value in the thrown
   * error's `message`, but only the _type_ of the actual incorrect value (using
   * the normal convention to locally rename properties like
   * `const { quote: q, Fail } = assert;`):
   * ```js
   * actual === expected || Fail`${actual} should be ${q(expected)}`;
   * ```
   *
   * The optional `space` parameter matches that of `JSON.stringify`, and is
   * used to request insertion of non-semantic line feeds, indentation, and
   * separating spaces in the output for improving readability of objects and
   * arrays.
   */
  quote(value: any, space?: string | number): Stringable;

  /**
   * Wrap a string such that its use as a substitution value in a template
   * literal tagged with {@link details} or {@link Fail} will be treated
   * literally rather than being quoted or redacted.
   *
   * To avoid injection attacks that exploit quoting confusion, this must NEVER
   * be used with data that is possibly attacker-controlled.
   *
   * As a further safeguard, we fall back to quoting any input that is not a
   * string of sufficiently word-like parts separated by isolated spaces (rather
   * than throwing an exception, which could hide the original problem for which
   * explanatory details are being constructed---i.e., ``` assert.details`...` ```
   * should never be the source of a new exception, nor should an attempt to
   * render its output, although we _could_ instead decide to handle the latter
   * by inline replacement similar to that of `bestEffortStringify` for producing
   * rendered messages like `(an object) was tagged "[Unsafe bare string]"`).
   */
  bare(text: string, spaces?: string | number): Stringable;
}

export interface DeprecatedAssertionUtilities {
  makeAssert: MakeAssert;
  error: AssertionUtilities['makeError'];
}

/**
 * Assert that `condition` is truthy, with optional details associated with
 * assertion failure (falsy condition).
 *
 * The literal portions of the template used to make a {@link DetailsToken} are
 * assumed non-sensitive, as are the `typeof` output for substitution values.
 * These are assembled into the error `message`. The actual contents of the
 * substitution values are assumed sensitive and usually redacted, to be
 * revealed only to an associated console. We assume only the virtual platform's
 * owner can read what is written to the console, where the owner is in a
 * privileged position over computation running on that platform.
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
