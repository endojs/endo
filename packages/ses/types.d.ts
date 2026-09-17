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
  /**
   * retain (default): the start compartment keeps the host
   * `URL`'s `createObjectURL` and `revokeObjectURL` blob-registry methods;
   * shared compartments receive a tamed `URL` without them.
   *
   * remove: the blob methods are removed everywhere, so the start
   * compartment and every shared compartment share one tamed `URL`.
   */
  urlBlobTaming?: 'retain' | 'remove';
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

export type StrictModuleDescriptor =
  | SourceModuleDescriptor
  | NamespaceModuleDescriptor;

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

    get __noNamespaceBox__(): boolean;

    evaluate(code: string, options?: CompartmentEvaluateOptions): any;

    import(
      specifier: string | null,
    ): Promise<{ namespace: ModuleExportsNamespace }>;

    load(specifier: string): Promise<void>;

    importNow(specifier: string): ModuleExportsNamespace;

    module(specifier: string): ModuleExportsNamespace;
  }
}
