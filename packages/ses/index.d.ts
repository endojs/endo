
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

export interface LockdownOptions {
  regExpTaming?: 'safe' | 'unsafe';
  localeTaming?: 'safe' | 'unsafe';
  consoleTaming?: 'safe' | 'unsafe';
  errorTrapping?: 'platform' | 'exit' | 'abort' | 'report';
  errorTaming?: 'safe' | 'unsafe';
  dateTaming?: 'safe' | 'unsafe'; // deprecated
  mathTaming?: 'safe' | 'unsafe'; // deprecated
  stackFiltering?: 'concise' | 'verbose';
  overrideTaming?: 'moderate' | 'min' | 'severe';
  overrideDebug?: Array<string>;
  domainTaming?: 'safe' | 'unsafe';
  __allowUnsafeMonkeyPatching__?: 'safe' | 'unsafe';
}

export type Lockdown = (options?: LockdownOptions) => void;

export type __LiveExportsMap__ = Record<string, [string, boolean]>
export type __FixedExportsMap__ = Record<string, [string]>

export interface PrecompiledStaticModuleInterface {
  imports: Array<string>;
  exports: Array<string>;
  reexports: Array<string>;
  __syncModuleProgram__: string;
  __liveExportsMap__: __LiveExportsMap__;
  __fixedExportsMap__: __FixedExportsMap__;
}

export interface ThirdPartyStaticModuleInterface {
  imports: Array<string>;
  exports: Array<string>;
  execute(proxiedExports: Object, compartment: Compartment, resolvedImports: Record<string, string>): void;
}

export type FinalStaticModuleType = PrecompiledStaticModuleInterface | ThirdPartyStaticModuleInterface

export interface RedirectStaticModuleInterface {
  record: FinalStaticModuleType,
  specifier: string
}

export type StaticModuleType = RedirectStaticModuleInterface | FinalStaticModuleType

export type ModuleExportsNamespace = Record<string, any>

export type Transform = (source: string) => string;
export type ResolveHook = (importSpecifier: string, referrerSpecifier: string) => string;
export type ModuleMap = Record<string, string | ModuleExportsNamespace>;
export type ModuleMapHook = (moduleSpecifier: string) => string | ModuleExportsNamespace | void;
export type ImportHook = (moduleSpecifier: string) => Promise<StaticModuleType>;

export interface CompartmentOptions {
  name?: string;
  transforms?: Array<Transform>;
  globalLexicals?: Record<string, any>;
  moduleMapHook?: ModuleMapHook,
  importHook?: ImportHook,
  resolveHook?: ResolveHook,
  __shimTransforms__?: Array<Transform>;
}

export interface EvaluateOptions {
  transforms?: Array<Transform>;
  sloppyGlobalsMode?: boolean;
  __moduleShimLexicals__?: Record<string, any>;
  __evadeHtmlCommentTest__?: boolean;
  __rejectSomeDirectEvalExpressions__?: boolean;
}

// The DetailsToken is an empty object literal.
export type DetailsToken = Record<any, never>
export type Details = string | DetailsToken

export interface AssertMakeErrorOptions {
}

type AssertTypeofBigint = (specimen: any, typeName: 'bigint', details?: Details) => asserts specimen is bigint;
type AssertTypeofBoolean = (specimen: any, typeName: 'boolean', details?: Details) => asserts specimen is boolean;
type AssertTypeofFunction = (specimen: any, typeName: 'function', details?: Details) => asserts specimen is Function;
type AssertTypeofNumber = (specimen: any, typeName: 'number', details?: Details) => asserts specimen is number;
type AssertTypeofObject = (specimen: any, typeName: 'object', details?: Details) => asserts specimen is Record<any, any> | null;
type AssertTypeofString = (specimen: any, typeName: 'string', details?: Details) => asserts specimen is string;
type AssertTypeofSymbol = (specimen: any, typeName: 'symbol', details?: Details) => asserts specimen is symbol;
type AssertTypeofUndefined = (specimen: any, typeName: 'undefined', details?: Details) => asserts specimen is undefined;

export type AssertTypeof = AssertTypeofBigint &
  AssertTypeofBoolean &
  AssertTypeofFunction &
  AssertTypeofNumber &
  AssertTypeofObject &
  AssertTypeofString &
  AssertTypeofSymbol &
  AssertTypeofUndefined;

export type Raise = (reason: Error) => void;
export type MakeAssert = (raise?: Raise, unredacted?: boolean) => Assert;

interface ToStringable {
  toString(): string
}

export interface Assert {
  (value: any, details?: Details, errorConstructor?:ErrorConstructor): asserts value;
  typeof: AssertTypeof,
  error(details?: Details, errorConstructor?:ErrorConstructor): Error;
  fail(details?: Details, errorConstructor?:ErrorConstructor): never;
  equal(left: any, right: any, details?: Details, errorConstructor?:ErrorConstructor): void;
  string(specimen: any, details?: Details): asserts specimen is string;
  note(error: Error, details: Details): void;
  details(template: TemplateStringsArray | string[], ...args: any): DetailsToken,
  quote(payload: any, spaces?: string|number): ToStringable,
  makeAssert: MakeAssert,
}

declare global {
  var harden: Harden;

  var lockdown: Lockdown;

  var assert: Assert;

  /**
   * Each Compartment constructor is a global. A host that wants to execute
   * code in a context bound to a new global creates a new compartment.
   */
  export class Compartment {
    constructor(globals?: Object, moduleMap?: ModuleMap, options?:CompartmentOptions);
    get globalThis(): Record<string, any>;
    get name(): string;
    evaluate(code: string): any;
    import(specifier: string): Promise<{namespace: ModuleExportsNamespace}>;
    load(specifier: string): Promise<void>;
    importNow(specifier: string): ModuleExportsNamespace;
    module(specifier: string): ModuleExportsNamespace;
  }
}
