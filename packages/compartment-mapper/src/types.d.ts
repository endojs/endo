export type FinalStaticModuleType = import('ses').FinalStaticModuleType;
export type ThirdPartyStaticModuleInterface = import('ses').ThirdPartyStaticModuleInterface;
export type ImportHook = import('ses').ImportHook;
export type StaticModuleType = import('ses').StaticModuleType;
export type Transform = import('ses').Transform;
/**
 * A compartment map describes how to construct an application as a graph of
 * Compartments, each corresponding to Node.js style packaged modules.
 */
export type CompartmentMapDescriptor = {
    tags: Array<string>;
    entry: EntryDescriptor;
    compartments: Record<string, CompartmentDescriptor>;
};
/**
 * The entry descriptor of a compartment map denotes the root module of an
 * application and the compartment that contains it.
 */
export type EntryDescriptor = {
    compartment: string;
    module: string;
};
/**
 * A compartment descriptor corresponds to a single Compartment
 * of an assembled Application and describes how to construct
 * one for a given library or application package.json.
 */
export type CompartmentDescriptor = {
    label: string;
    /**
     * - shortest path of dependency names to this
     * compartment
     */
    path?: string[] | undefined;
    /**
     * - the name of the originating package suitable for
     * constructing a sourceURL prefix that will match it to files in a developer
     * workspace.
     */
    name: string;
    location: string;
    /**
     * - whether this compartment was retained by
     * any module in the solution. This property should never appear in an archived
     * compartment map.
     */
    retained?: boolean | undefined;
    modules: Record<string, ModuleDescriptor>;
    scopes: Record<string, ScopeDescriptor>;
    /**
     * - language for extension
     */
    parsers: Record<string, Language>;
    /**
     * - language for module specifier
     */
    types: Record<string, Language>;
    /**
     * - policy specific to compartment
     */
    policy: object;
};
/**
 * For every module explicitly mentioned in an `exports` field of a
 * package.json, there is a corresponding module descriptor.
 */
export type ModuleDescriptor = {
    compartment?: string | undefined;
    module?: string | undefined;
    location?: string | undefined;
    parser?: Language | undefined;
    /**
     * in base 16, hex
     */
    sha512?: string | undefined;
    exit?: string | undefined;
    deferredError?: string | undefined;
};
/**
 * Scope descriptors link all names under a prefix to modules in another
 * compartment, like a wildcard.
 * These are employed to link any module not explicitly mentioned
 * in a package.json file, when that package.json file does not have
 * an explicit `exports` map.
 */
export type ScopeDescriptor = {
    compartment: string;
    module?: string | undefined;
};
export type Language = 'mjs' | 'cjs' | 'json' | 'bytes' | 'text' | 'pre-mjs-json' | 'pre-cjs-json';
export type ArchiveWriter = {
    write: WriteFn;
    snapshot: SnapshotFn;
};
export type WriteFn = (location: string, bytes: Uint8Array) => Promise<void>;
export type ArchiveReader = {
    read: ReadFn;
};
export type ReadFn = (location: string) => Promise<Uint8Array>;
/**
 * A resolution of `undefined` indicates `ENOENT` or the equivalent.
 */
export type MaybeReadFn = (location: string) => Promise<Uint8Array | undefined>;
/**
 * Returns a canonical URL for a given URL, following redirects or symbolic
 * links if any exist along the path.
 * Must return the given logical location if the real location does not exist.
 */
export type CanonicalFn = (location: string) => Promise<string>;
export type HashFn = (bytes: string | Uint8Array) => string;
export type Application = {
    import: ExecuteFn;
    sha512?: string | undefined;
};
export type ExecuteFn = (options?: ExecuteOptions | undefined) => Promise<SomeObject>;
export type SnapshotFn = () => Promise<Uint8Array>;
export type ReadPowers = {
    read: ReadFn;
    canonical: CanonicalFn;
    computeSha512?: HashFn | undefined;
    fileURLToPath?: Function | undefined;
    pathToFileURL?: Function | undefined;
    requireResolve?: Function | undefined;
};
export type MaybeReadPowers = ReadPowers | object;
export type HashPowers = {
    read: ReadFn;
    canonical: CanonicalFn;
    computeSha512: HashFn;
};
export type WritePowers = {
    write: WriteFn;
};
export type ResolveHook = (importSpecifier: string, referrerSpecifier: string) => string;
export type ShouldDeferError = (language: Language | undefined) => boolean;
export type ImportHookMakerOptions = {
    packageLocation: string;
    packageName: string;
    attenuators: DeferredAttenuatorsProvider;
    parse: ParseFn;
    shouldDeferError: ShouldDeferError;
    compartments: Record<string, Compartment>;
};
export type ImportHookMaker = (options: ImportHookMakerOptions) => ImportHook;
export type SourceMapHookDetails = {
    compartment: string;
    module: string;
    location: string;
    sha512: string;
};
export type SourceMapHook = (sourceMap: string, details: SourceMapHookDetails) => any;
export type ComputeSourceMapLocationDetails = {
    compartment: string;
    module: string;
    location: string;
    sha512: string;
};
export type ComputeSourceMapLocationHook = (details: ComputeSourceMapLocationDetails) => string;
export type ParseFn = (bytes: Uint8Array, specifier: string, location: string, packageLocation: string, options?: {
    sourceMap?: string | undefined;
    sourceMapHook?: SourceMapHook | undefined;
    sourceMapUrl?: string | undefined;
    readPowers?: ReadFn | ReadPowers | undefined;
} | undefined) => Promise<{
    bytes: Uint8Array;
    parser: Language;
    record: FinalStaticModuleType;
    sourceMap?: string;
}>;
/**
 * ParserImplementation declares if a heuristic is used by parser to detect
 * imports - is set to true for cjs, which uses a lexer to find require calls
 */
export type ParserImplementation = {
    heuristicImports: boolean;
    parse: ParseFn;
};
export type ComputeSourceLocationHook = (compartmentName: string, moduleSpecifier: string) => string | undefined;
export type ExitModuleImportHook = (specifier: string) => Promise<ThirdPartyStaticModuleInterface | undefined>;
export type LoadArchiveOptions = {
    expectedSha512?: string | undefined;
    modules?: Record<string, any> | undefined;
    Compartment?: typeof Compartment | undefined;
    computeSourceLocation?: ComputeSourceLocationHook | undefined;
    computeSourceMapLocation?: ComputeSourceMapLocationHook | undefined;
};
export type ExecuteOptions = {
    globals?: object;
    transforms?: import("ses").Transform[] | undefined;
    __shimTransforms__?: import("ses").Transform[] | undefined;
    modules?: Record<string, any> | undefined;
    importHook?: ExitModuleImportHook | undefined;
    attenuations?: Record<string, any> | undefined;
    Compartment?: typeof Compartment | undefined;
};
export type ParserForLanguage = Record<string, ParserImplementation>;
export type ExtraLinkOptions = {
    resolve?: ResolveHook | undefined;
    makeImportHook: ImportHookMaker;
    parserForLanguage: ParserForLanguage;
    moduleTransforms?: ModuleTransforms | undefined;
    archiveOnly?: boolean | undefined;
};
export type LinkOptions = ExecuteOptions & ExtraLinkOptions;
export type ModuleTransforms = Record<string, ModuleTransform>;
export type ModuleTransform = (bytes: Uint8Array, specifier: string, location: string, packageLocation: string, options?: {
    sourceMap?: string | undefined;
} | undefined) => Promise<{
    bytes: Uint8Array;
    parser: Language;
    sourceMap?: string;
}>;
export type Sources = Record<string, CompartmentSources>;
export type CompartmentSources = Record<string, ModuleSource>;
export type ModuleSource = {
    /**
     * - module loading error deferred to later stage
     */
    deferredError?: string | undefined;
    /**
     * - package relative location
     */
    location?: string | undefined;
    /**
     * - fully qualified location
     */
    sourceLocation?: string | undefined;
    bytes?: Uint8Array | undefined;
    /**
     * in base16, hex
     */
    sha512?: string | undefined;
    parser?: Language | undefined;
    exit?: string | undefined;
    record?: import("ses").StaticModuleType | undefined;
};
export type Artifact = {
    bytes: Uint8Array;
    parser: Language;
};
export type CaptureSourceLocationHook = (compartmentName: string, moduleSpecifier: string, sourceLocation: string) => any;
export type ArchiveOptions = {
    moduleTransforms?: ModuleTransforms | undefined;
    modules?: Record<string, any> | undefined;
    dev?: boolean | undefined;
    policy?: object;
    tags?: Set<string> | undefined;
    captureSourceLocation?: CaptureSourceLocationHook | undefined;
    importHook?: ExitModuleImportHook | undefined;
    searchSuffixes?: string[] | undefined;
    commonDependencies?: Record<string, string> | undefined;
    sourceMapHook?: SourceMapHook | undefined;
};
export type PackageNamingKit = {
    /**
     * - true if location is the entry compartment
     */
    isEntry?: boolean | undefined;
    name: string;
    path: Array<string>;
};
/**
 * An object representing a full attenuation definition.
 */
export type FullAttenuationDefinition = {
    /**
     * - The type of attenuation.
     */
    attenuate: string;
    /**
     * - The parameters for the attenuation.
     */
    params: ImplicitAttenuationDefinition;
};
/**
 * An array of any type representing an implicit attenuation definition.
 */
export type ImplicitAttenuationDefinition = [any, ...any[]];
/**
 * A type representing an attenuation definition, which can be either a full or implicit definition.
 */
export type AttenuationDefinition = FullAttenuationDefinition | [any, ...any[]];
export type UnifiedAttenuationDefinition = {
    displayName: string;
    specifier: string | null;
    params?: any[] | undefined;
};
export type Attenuator<GlobalParams extends [any, ...any[]] = [any, ...any[]], ModuleParams extends [any, ...any[]] = [any, ...any[]]> = {
    attenuateGlobals?: GlobalAttenuatorFn<GlobalParams> | undefined;
    attenuateModule?: ModuleAttenuatorFn<ModuleParams, unknown, unknown> | undefined;
};
export type GlobalAttenuatorFn<Params extends [any, ...any[]] = [any, ...any[]]> = (params: Params, originalObject: Record<PropertyKey, any>, globalThis: Record<PropertyKey, any>) => void;
export type ModuleAttenuatorFn<Params extends [any, ...any[]] = [any, ...any[]], T = unknown, U = T> = (params: Params, ns: T) => U;
export type DeferredAttenuatorsProvider = {
    import: (attenuatorSpecifier: string | null) => Promise<Attenuator>;
};
/**
 * A type representing a wildcard policy, which can be 'any'.
 */
export type WildcardPolicy = 'any';
/**
 * A type representing a property policy, which is a record of string keys and boolean values.
 */
export type PropertyPolicy = Record<string, boolean>;
/**
 * A type representing a policy item, which can be a {@link WildcardPolicy wildcard policy}, a property policy, `undefined`, or defined by an attenuator
 */
export type PolicyItem<T = void> = WildcardPolicy | PropertyPolicy | T;
/**
 * An object representing a nested attenuation definition.
 */
export type NestedAttenuationDefinition = Record<string, AttenuationDefinition | boolean>;
/**
 * An object representing a base package policy.
 */
export type PackagePolicy<PackagePolicyItem = void, GlobalsPolicyItem = void, BuiltinsPolicyItem = void> = {
    /**
     * - The default attenuator.
     */
    defaultAttenuator?: string | undefined;
    /**
     * - The policy item for packages.
     */
    packages?: PolicyItem<PackagePolicyItem> | undefined;
    /**
     * - The policy item or full attenuation definition for globals.
     */
    globals?: AttenuationDefinition | PolicyItem<GlobalsPolicyItem> | undefined;
    /**
     * - The policy item or nested attenuation definition for builtins.
     */
    builtins?: NestedAttenuationDefinition | PolicyItem<BuiltinsPolicyItem> | undefined;
    /**
     * - Whether to disable global freeze.
     */
    noGlobalFreeze?: boolean | undefined;
};
/**
 * An object representing a base policy.
 */
export type Policy<PackagePolicyItem = void, GlobalsPolicyItem = void, BuiltinsPolicyItem = void> = {
    /**
     * - The package policies for the resources.
     */
    resources: Record<string, PackagePolicy<PackagePolicyItem, GlobalsPolicyItem, BuiltinsPolicyItem>>;
    /**
     * - The default attenuator.
     */
    defaultAttenuator?: string | undefined;
    /**
     * - The package policy for the entry.
     */
    entry?: PackagePolicy<PackagePolicyItem, GlobalsPolicyItem, BuiltinsPolicyItem> | undefined;
};
/**
 * Any object. All objects. Not `null`, though.
 */
export type SomeObject = Record<PropertyKey, any>;
//# sourceMappingURL=types.d.ts.map