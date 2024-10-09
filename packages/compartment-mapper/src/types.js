// @ts-check

export {};

/** @import {FinalStaticModuleType} from 'ses' */
/** @import {ImportHook} from 'ses' */
/** @import {ImportNowHook} from 'ses' */
/** @import {StaticModuleType} from 'ses' */
/** @import {ThirdPartyStaticModuleInterface} from 'ses' */
/** @import {Transform} from 'ses' */

// /////////////////////////////////////////////////////////////////////////////

// The schema of a compartment map JSON file:

/**
 * A compartment map describes how to construct an application as a graph of
 * Compartments, each corresponding to Node.js style packaged modules.
 *
 * @typedef {object} CompartmentMapDescriptor
 * @property {Array<string>} tags
 * @property {EntryDescriptor} entry
 * @property {Record<string, CompartmentDescriptor>} compartments
 */

/**
 * The entry descriptor of a compartment map denotes the root module of an
 * application and the compartment that contains it.
 *
 * @typedef {object} EntryDescriptor
 * @property {string} compartment
 * @property {string} module
 */

/**
 * A compartment descriptor corresponds to a single Compartment
 * of an assembled Application and describes how to construct
 * one for a given library or application `package.json`.
 *
 * @typedef {object} CompartmentDescriptor
 * @property {string} label
 * @property {Array<string>} [path] - shortest path of dependency names to this
 * compartment
 * @property {string} name - the name of the originating package suitable for
 * constructing a sourceURL prefix that will match it to files in a developer
 * workspace.
 * @property {string} location
 * @property {boolean} [retained] - whether this compartment was retained by
 * any module in the solution. This property should never appear in an archived
 * compartment map.
 * @property {Record<string, ModuleDescriptor>} modules
 * @property {Record<string, ScopeDescriptor>} scopes
 * @property {LanguageForExtension} parsers - language for extension
 * @property {LanguageForModuleSpecifier} types - language for module specifier
 * @property {SomePackagePolicy} policy - policy specific to compartment
 * @property {Set<string>} compartments - List of compartment names this Compartment depends upon
 */

/**
 * For every module explicitly mentioned in an `exports` field of a
 * `package.json`, there is a corresponding module descriptor.
 *
 * @typedef {object} ModuleDescriptor
 * @property {string=} [compartment]
 * @property {string} [module]
 * @property {string} [location]
 * @property {Language} [parser]
 * @property {string} [sha512] in base 16, hex
 * @property {string} [exit]
 * @property {string} [deferredError]
 */

/**
 * Scope descriptors link all names under a prefix to modules in another
 * compartment, like a wildcard.
 * These are employed to link any module not explicitly mentioned
 * in a `package.json` file, when that `package.json` file does not have
 * an explicit `exports` map.
 *
 * @typedef {object} ScopeDescriptor
 * @property {string} compartment
 * @property {string} [module]
 */

/**
 * Natively-recognized and custom languages
 *
 * @typedef {LiteralUnion<BuiltinLanguage, string>} Language
 */

/**
 * Languages natively recognized by `compartment-mapper`
 *
 * @typedef {'mjs' | 'cjs' | 'json' | 'bytes' | 'text' | 'pre-mjs-json' | 'pre-cjs-json'} BuiltinLanguage
 */

// /////////////////////////////////////////////////////////////////////////////

// IO capabilities and archives:

/**
 * @typedef {object} ArchiveWriter
 * @property {WriteFn} write
 * @property {SnapshotFn} snapshot
 */

/**
 * @callback WriteFn
 * @param {string} location
 * @param {Uint8Array} bytes
 * @returns {Promise<void>}
 */

/**
 * @typedef {object} ArchiveReader
 * @property {ReadFn} read
 */

/**
 * @callback ReadFn
 * @param {string} location
 * @returns {Promise<Uint8Array>} bytes
 */

/**
 * @callback ReadNowFn
 * @param {string} location
 * @returns {Uint8Array} bytes
 */

/**
 * A resolution of `undefined` indicates `ENOENT` or the equivalent.
 *
 * @callback MaybeReadFn
 * @param {string} location
 * @returns {Promise<Uint8Array | undefined>} bytes
 */

/**
 * A resolution of `undefined` indicates `ENOENT` or the equivalent.
 *
 * @callback MaybeReadNowFn
 * @param {string} location
 * @returns {Uint8Array | undefined} bytes
 */

/**
 * Returns a canonical URL for a given URL, following redirects or symbolic
 * links if any exist along the path.
 * Must return the given logical location if the real location does not exist.
 *
 * @callback CanonicalFn
 * @param {string} location
 * @returns {Promise<string>} canonical location
 */

/**
 * @callback HashFn
 * @param {string | Uint8Array} bytes
 * @returns {string} hash
 */

/**
 * @typedef {object} Application
 * @property {ExecuteFn} import
 * @property {string} [sha512]
 */

/**
 * @callback ExecuteFn
 * @param {ExecuteOptions} [options]
 * @returns {Promise<SomeObject>}
 */

/**
 * @callback SnapshotFn
 * @returns {Promise<Uint8Array>}
 */

/**
 * @callback FileURLToPathFn
 * @param {string|URL} location
 * @returns {string}
 */

/**
 * @callback IsAbsoluteFn
 * @param {string} location
 * @returns {boolean}
 */

/**
 * Node.js' `url.pathToFileURL` only returns a {@link URL}.
 * @callback PathToFileURLFn
 * @param {string} location
 * @returns {URL|string}
 */

/**
 * @callback RequireResolveFn
 * @param {string} fromLocation
 * @param {string} specifier
 * @param {{paths?: string[]}} [options]
 */

/**
 * @typedef {object} ReadPowers
 * @property {ReadFn} read
 * @property {CanonicalFn} canonical
 * @property {MaybeReadNowFn} [maybeReadNow]
 * @property {HashFn} [computeSha512]
 * @property {FileURLToPathFn} [fileURLToPath]
 * @property {PathToFileURLFn} [pathToFileURL]
 * @property {RequireResolveFn} [requireResolve]
 * @property {IsAbsoluteFn} [isAbsolute]
 */

/**
 * These properties are necessary for dynamic require support
 *
 * @typedef {'fileURLToPath' | 'isAbsolute' | 'maybeReadNow'} ReadNowPowersProp
 * @see {@link ReadNowPowers}
 */

/**
 * The extension of {@link ReadPowers} necessary for dynamic require support
 *
 * For a `ReadPowers` to be a `ReadNowPowers`:
 *
 * 1. It must be an object (not a {@link ReadFn})
 * 2. Prop `maybeReadNow` is a function
 * 3. Prop `fileURLToPath` is a function
 * 4. Prop `isAbsolute` is a function
 *
 * @typedef {Omit<ReadPowers, ReadNowPowersProp> & Required<Pick<ReadPowers, ReadNowPowersProp>>} ReadNowPowers
 */

/**
 * @typedef MakeImportNowHookMakerOptions
 * @property {Sources} [sources]
 * @property {Record<string, CompartmentDescriptor>} [compartmentDescriptors]
 * @property {HashFn} [computeSha512]
 * @property {string[]} [searchSuffixes] Suffixes to search if the unmodified
 * specifier is not found. Pass `[]` to emulate Node.js' strict behavior. The
 * default handles Node.js' CommonJS behavior. Unlike Node.js, the Compartment
 * Mapper lifts CommonJS up, more like a bundler, and does not attempt to vary
 * the behavior of resolution depending on the language of the importing module.
 * @property {SourceMapHook} [sourceMapHook]
 * @property {ExitModuleImportNowHook} [exitModuleImportNowHook]
 */

/**
 * @typedef {ReadPowers & {maybeRead: MaybeReadFn}} MaybeReadPowers
 */

/**
 * @typedef {object} HashPowers
 * @property {ReadFn} read
 * @property {CanonicalFn} canonical
 * @property {HashFn} computeSha512
 */

/**
 * @typedef {object} WritePowers
 * @property {WriteFn} write
 */

// /////////////////////////////////////////////////////////////////////////////

// Shared machinery for assembling applications:

/**
 * @callback ResolveHook
 * @param {string} importSpecifier
 * @param {string} referrerSpecifier
 * @returns {string} moduleSpecifier
 */

/**
 * @callback ShouldDeferError
 * @param {Language | undefined} language
 * @returns {boolean}
 */

/**
 * @typedef {object} ImportHookMakerOptions
 * @property {string} packageLocation
 * @property {string} packageName
 * @property {DeferredAttenuatorsProvider} attenuators
 * @property {ParseFn|ParseFnAsync} parse
 * @property {ShouldDeferError} shouldDeferError
 * @property {Record<string, Compartment>} compartments
 */

/**
 * @callback ImportHookMaker
 * @param {ImportHookMakerOptions} options
 * @returns {ImportHook}
 */

/**
 * @typedef {object} ImportNowHookMakerParams
 * @property {string} packageLocation
 * @property {string} packageName
 * @property {ParseFn|ParseFnAsync} parse
 * @property {Record<string, Compartment>} compartments
 */

/**
 * @callback ImportNowHookMaker
 * @param {ImportNowHookMakerParams} params
 * @returns {ImportNowHook}
 */

/**
 * @typedef {object} SourceMapHookDetails
 * @property {string} compartment
 * @property {string} module
 * @property {string} location
 * @property {string} sha512
 */

/**
 * @callback SourceMapHook
 * @param {string} sourceMap
 * @param {SourceMapHookDetails} details
 */

/**
 * @typedef {object} ComputeSourceMapLocationDetails
 * @property {string} compartment
 * @property {string} module
 * @property {string} location
 * @property {string} sha512
 */

/**
 * @callback ComputeSourceMapLocationHook
 * @param {ComputeSourceMapLocationDetails} details
 * @returns {string}
 */

/**
 * Result of a {@link ParseFn}
 *
 * @typedef ParseResult
 * @property {Uint8Array} bytes
 * @property {Language} parser
 * @property {FinalStaticModuleType} record
 * @property {string} [sourceMap]
 */

/**
 * @callback ParseFn_
 * @param {Uint8Array} bytes
 * @param {string} specifier
 * @param {string} location
 * @param {string} packageLocation
 * @param {object} [options]
 * @param {string} [options.sourceMap]
 * @param {SourceMapHook} [options.sourceMapHook]
 * @param {string} [options.sourceMapUrl]
 * @param {ReadFn | ReadPowers} [options.readPowers]
 * @param {CompartmentDescriptor} [options.compartmentDescriptor]
 * @returns {ParseResult}
 */

/**
 * @typedef {ParseFn_ & {isSyncParser?: true}} ParseFn
 */

/**
 * @callback ParseFnAsync
 * @param {Uint8Array} bytes
 * @param {string} specifier
 * @param {string} location
 * @param {string} packageLocation
 * @param {object} [options]
 * @param {string} [options.sourceMap]
 * @param {SourceMapHook} [options.sourceMapHook]
 * @param {string} [options.sourceMapUrl]
 * @param {ReadFn | ReadPowers} [options.readPowers]
 * @returns {Promise<ParseResult>}
 */

/**
 * ParserImplementation declares if a heuristic is used by parser to detect
 * imports - is set to true for cjs, which uses a lexer to find require calls
 *
 * @typedef {object} ParserImplementation
 * @property {boolean} heuristicImports
 * @property {boolean} [synchronous]
 * @property {ParseFn} parse
 */

/**
 * @callback ComputeSourceLocationHook
 * @param {string} compartmentName
 * @param {string} moduleSpecifier
 * @returns {string|undefined} sourceLocation
 */

/**
 * @callback ExitModuleImportHook
 * @param {string} specifier
 * @returns {Promise<ThirdPartyStaticModuleInterface|undefined>} module namespace
 */

/**
 * @callback ExitModuleImportNowHook
 * @param {string} specifier
 * @param {string} referrer
 * @returns {ThirdPartyStaticModuleInterface|undefined} module namespace
 */

/**
 * @see {@link LoadArchiveOptions}
 * @typedef {object} ExtraLoadArchiveOptions
 * @property {string} [expectedSha512]
 * @property {Record<string, any>} [modules]
 * @property {typeof Compartment} [Compartment]
 * @property {ComputeSourceLocationHook} [computeSourceLocation]
 * @property {ComputeSourceMapLocationHook} [computeSourceMapLocation]
 * @property {ParserForLanguage} [parserForLanguage]
 * @property {LanguageForExtension} [languageForExtension]
 */

/**
 * Options for `loadArchive()`
 *
 * @typedef {ExecuteOptions & ExtraLoadArchiveOptions} LoadArchiveOptions
 */

/**
 * Set of options available in the context of code execution.
 *
 * May be used only as an intersection with other "options" types
 *
 * @typedef {object} ExecuteOptions
 * @property {object} [globals]
 * @property {Array<Transform>} [transforms]
 * @property {Array<Transform>} [__shimTransforms__]
 * @property {boolean} [__native__] Use native Compartment and native
 * @property {Record<string, object>} [modules]
 * @property {ExitModuleImportHook} [importHook]
 * @property {Record<string, object>} [attenuations]
 * @property {typeof Compartment} [Compartment]
 */

/**
 * Mapping of {@link Language Languages} to {@link ParserImplementation ParserImplementations}
 *
 * @typedef {Record<Language | string, ParserImplementation>} ParserForLanguage
 */

/**
 * Mapping of file extension to {@link Language Languages}.
 *
 * @typedef {Record<string, Language>} LanguageForExtension
 */

/**
 * Mapping of module specifier to {@link Language Languages}.
 *
 * @typedef {Record<string, Language>} LanguageForModuleSpecifier
 */

/**
 * Options for `loadLocation()`
 *
 * @typedef {ArchiveOptions|SyncArchiveOptions} LoadLocationOptions
 */

/**
 * @see {@link LinkOptions}
 * @typedef {object} ExtraLinkOptions
 * @property {ResolveHook} [resolve]
 * @property {ImportHookMaker} makeImportHook
 * @property {ImportNowHookMaker} [makeImportNowHook]
 * @property {ParserForLanguage} [parserForLanguage]
 * @property {LanguageForExtension} [languageForExtension]
 * @property {ModuleTransforms} [moduleTransforms]
 * @property {SyncModuleTransforms} [syncModuleTransforms]
 * @property {boolean} [__native__] Use native Compartment and native
 * ModuleSource (XS only at time of writing)
 * @property {boolean} [archiveOnly]
 */

/**
 * @typedef LinkResult
 * @property {Compartment} compartment,
 * @property {Record<string, Compartment>} compartments
 * @property {Compartment} attenuatorsCompartment
 * @property {Promise<void>} pendingJobsPromise
 */

/**
 * Options for `link()`
 *
 * @typedef {ExecuteOptions & ExtraLinkOptions} LinkOptions
 */

/**
 * @typedef {Record<string, ModuleTransform>} ModuleTransforms
 */

/**
 * @typedef {Record<string, SyncModuleTransform>} SyncModuleTransforms
 */

/**
 * @callback ModuleTransform
 * @param {Uint8Array} bytes
 * @param {string} specifier
 * @param {string} location
 * @param {string} packageLocation
 * @param {object} [params]
 * @param {string} [params.sourceMap]
 * @returns {Promise<{bytes: Uint8Array, parser: Language, sourceMap?: string}>}
 */

/**
 * @callback SyncModuleTransform
 * @param {Uint8Array} bytes
 * @param {string} specifier
 * @param {string} location
 * @param {string} packageLocation
 * @param {object} [params]
 * @param {string} [params.sourceMap]
 * @returns {{bytes: Uint8Array, parser: Language, sourceMap?: string}}
 */

// /////////////////////////////////////////////////////////////////////////////

// Communicating source files from an archive snapshot, from archive.js to
// import-hook.js:

/**
 * @typedef {Record<string, CompartmentSources>} Sources
 */

/**
 * @typedef {Record<string, ModuleSource>} CompartmentSources
 */

/**
 * @typedef {object} ModuleSource
 * @property {string} [deferredError] - module loading error deferred to later stage
 * @property {string} [location] - package relative location
 * @property {string} [sourceLocation] - fully qualified location
 * @property {Uint8Array} [bytes]
 * @property {string} [sha512] in base16, hex
 * @property {Language} [parser]
 * @property {string} [exit]
 * @property {StaticModuleType} [record]
 */

/**
 * @typedef {object} Artifact
 * @property {Uint8Array} bytes
 * @property {Language} parser
 */

/**
 * @callback CaptureSourceLocationHook
 * @param {string} compartmentName
 * @param {string} moduleSpecifier
 * @param {string} sourceLocation
 */

/**
 * @typedef {object} ArchiveOptions
 * @property {ModuleTransforms} [moduleTransforms]
 * @property {SyncModuleTransforms} [syncModuleTransforms]
 * @property {Record<string, any>} [modules]
 * @property {boolean} [dev]
 * @property {SomePolicy} [policy]
 * @property {Set<string>} [tags] deprecated in favor of `conditions`
 * @property {Set<string>} [conditions]
 * @property {CaptureSourceLocationHook} [captureSourceLocation]
 * @property {ExitModuleImportHook} [importHook]
 * @property {Array<string>} [searchSuffixes]
 * @property {Record<string, string>} [commonDependencies]
 * @property {SourceMapHook} [sourceMapHook]
 * @property {Record<string, ParserImplementation>} [parserForLanguage]
 * @property {LanguageForExtension} [languageForExtension]
 */

/**
 * @typedef SyncArchiveOptions
 * @property {SyncModuleTransforms} [syncModuleTransforms]
 * @property {Record<string, any>} [modules]
 * @property {boolean} [dev]
 * @property {object} [policy]
 * @property {Set<string>} [tags]
 * @property {CaptureSourceLocationHook} [captureSourceLocation]
 * @property {ExitModuleImportHook} [importHook]
 * @property {Array<string>} [searchSuffixes]
 * @property {Record<string, string>} [commonDependencies]
 * @property {SourceMapHook} [sourceMapHook]
 * @property {ExitModuleImportNowHook} [importNowHook]
 * @property {Record<string, ParserImplementation>} [parserForLanguage]
 * @property {LanguageForExtension} [languageForExtension]
 */

// /////////////////////////////////////////////////////////////////////////////

// Policy enforcement infrastructure

/**
 * @typedef {object} PackageNamingKit
 * @property {boolean} [isEntry] - true if location is the entry compartment
 * @property {string} name
 * @property {Array<string>} path
 */

/**
 * An object representing a full attenuation definition.
 * @typedef {object} FullAttenuationDefinition
 * @property {string} attenuate - The type of attenuation.
 * @property {ImplicitAttenuationDefinition} params - The parameters for the attenuation.
 */

/**
 * An array of any type representing an implicit attenuation definition.
 * @typedef {[any, ...any[]]} ImplicitAttenuationDefinition
 */

/**
 * A type representing an attenuation definition, which can be either a full or implicit definition.
 * @typedef {FullAttenuationDefinition | ImplicitAttenuationDefinition} AttenuationDefinition
 */

/**
 * @typedef {object} UnifiedAttenuationDefinition
 * @property {string} displayName
 * @property {string | null} specifier
 * @property {Array<any>} [params]
 */

/**
 * @template {[any, ...any[]]} [GlobalParams=[any, ...any[]]]
 * @template {[any, ...any[]]} [ModuleParams=[any, ...any[]]]
 * @typedef Attenuator
 * @property {GlobalAttenuatorFn<GlobalParams>} [attenuateGlobals]
 * @property {ModuleAttenuatorFn<ModuleParams>} [attenuateModule]
 */

/**
 * @template {[any, ...any[]]} [Params=[any, ...any[]]]
 * @callback GlobalAttenuatorFn
 * @param {Params} params
 * @param {Record<PropertyKey, any>} originalObject
 * @param {Record<PropertyKey, any>} globalThis
 * @returns {void}
 * @todo Unsure if we can do much typing of `originalObject` and `globalThis` here.
 */

/**
 * @template {[any, ...any[]]} [Params=[any, ...any[]]]
 * @template [T=SomeObject]
 * @template [U=T]
 * @callback ModuleAttenuatorFn
 * @param {Params} params
 * @param {T} ns
 * @returns {U}
 */

/**
 * @typedef {object} DeferredAttenuatorsProvider
 * @property {(attenuatorSpecifier: string|null) => Promise<Attenuator>} import
 */

/**
 * A type representing a wildcard policy, which can be 'any'.
 * @typedef {'any'} WildcardPolicy
 */

/**
 * A type representing a property policy, which is a record of string keys and boolean values
 * @typedef {Record<string, boolean>} PropertyPolicy
 */

/**
 * A type representing a policy item, which can be a {@link WildcardPolicy wildcard policy}, a property policy, `undefined`, or defined by an attenuator
 * @template [T=void]
 * @typedef {WildcardPolicy|PropertyPolicy|T} PolicyItem
 */

/**
 * An object representing a nested attenuation definition.
 * @typedef {Record<string, AttenuationDefinition | boolean>} NestedAttenuationDefinition
 */

/**
 * An object representing a base package policy.
 *
 * @template [PackagePolicyItem=void] Additional types for a package policy item
 * @template [GlobalsPolicyItem=void] Additional types for a global policy item
 * @template [BuiltinsPolicyItem=void] Additional types for a builtin policy item
 * @template [ExtraOptions=unknown] Additional options
 * @typedef {object} PackagePolicy
 * @property {string} [defaultAttenuator] - The default attenuator.
 * @property {PolicyItem<PackagePolicyItem>} [packages] - The policy item for packages.
 * @property {PolicyItem<GlobalsPolicyItem>|AttenuationDefinition} [globals] - The policy item or full attenuation definition for globals.
 * @property {PolicyItem<BuiltinsPolicyItem>|NestedAttenuationDefinition} [builtins] - The policy item or nested attenuation definition for builtins.
 * @property {boolean} [noGlobalFreeze] - Whether to disable global freeze.
 * @property {boolean} [dynamic] - Whether to allow dynamic imports
 * @property {ExtraOptions} [options] - Any additional user-defined options can be added to the policy here
 */

/**
 * An object representing a base policy.
 *
 * @template [PackagePolicyItem=void] Additional types for a package policy item
 * @template [GlobalsPolicyItem=void] Additional types for a global policy item
 * @template [BuiltinsPolicyItem=void] Additional types for a builtin policy item
 * @template [ExtraOptions=unknown] Additional package-level options
 * @typedef {object} Policy
 * @property {Record<string, PackagePolicy<PackagePolicyItem, GlobalsPolicyItem, BuiltinsPolicyItem, ExtraOptions>>} resources - The package policies for the resources.
 * @property {string} [defaultAttenuator] - The default attenuator.
 * @property {PackagePolicy<PackagePolicyItem, GlobalsPolicyItem, BuiltinsPolicyItem, ExtraOptions>} [entry] - The package policy for the entry.
 */

/**
 * Any object. All objects. Not `null`, though.
 * @typedef {Record<PropertyKey, any>} SomeObject
 */

/**
 * Function in {@link CryptoInterface}
 *
 * @callback CreateHashFn
 * @param {'sha512'} algorithm
 * @returns {Hash}
 */

/**
 * Object returned by function in {@link CryptoInterface}
 *
 * @typedef Hash
 * @property {(data: Uint8Array|string) => Hash} update
 * @property {() => Buffer} digest
 * @see {@link https://nodejs.org/api/crypto.html#class-hash}
 */

/**
 * Function in {@link FsPromisesInterface}
 *
 * @callback RealpathFn
 * @param {string} filepath
 * @returns {Promise<string>}
 */

/**
 * Object within {@link FsPromisesInterface}
 *
 * @typedef FsPromisesInterface
 * @property {RealpathFn} realpath
 * @property {WriteFn} writeFile
 * @property {ReadFn} readFile
 * @see {@link https://nodejs.org/api/fs.html#promises-api}
 */

/**
 * For creating {@link ReadPowers}
 *
 * @typedef FsInterface
 * @property {FsPromisesInterface} promises
 * @property {ReadNowFn} readFileSync
 * @see {@link https://nodejs.org/api/fs.html}
 */

/**
 * For creating {@link ReadPowers}
 *
 * @typedef UrlInterface
 * @property {FileURLToPathFn} fileURLToPath
 * @property {PathToFileURLFn} pathToFileURL
 * @see {@link https://nodejs.org/api/url.html}
 */

/**
 * For creating {@link ReadPowers}
 * @typedef CryptoInterface
 * @property {CreateHashFn} createHash
 * @see {@link https://nodejs.org/api/crypto.html}
 */

/**
 * @typedef PathInterface
 * @property {IsAbsoluteFn} isAbsolute
 * @see {@link https://nodejs.org/api/path.html}
 */

/**
 * Options for `compartmentMapForNodeModules`
 *
 * @typedef {Pick<ArchiveOptions, 'dev' | 'commonDependencies' | 'policy'>} CompartmentMapForNodeModulesOptions
 */

/**
 * Any {@link PackagePolicy}
 *
 * @typedef {PackagePolicy<PolicyItem, PolicyItem, PolicyItem, unknown>} SomePackagePolicy
 */

/**
 * Any {@link Policy}
 *
 * @typedef {Policy<any, any, any, any>} SomePolicy
 */

/**
 * Matches any {@link https://developer.mozilla.org/en-US/docs/Glossary/Primitive primitive value}.
 *
 * @typedef {null|undefined|string|number|boolean|symbol|bigint} Primitive
 * @see {@link https://github.com/sindresorhus/type-fest/blob/main/source/primitive.d.ts original source}
 */

/**
 * Allows creating a union type by combining primitive types and literal
 * types without sacrificing auto-completion in IDEs for the literal type part
 * of the union.
 *
 * Currently, when a union type of a primitive type is combined with literal types,
 * TypeScript loses all information about the combined literals. Thus, when such
 * a type is used in an IDE with autocompletion, no suggestions are made for the
 * declared literals.
 *
 * This type is a workaround for {@link https://github.com/Microsoft/TypeScript/issues/29729 Microsoft/TypeScript#29729}.
 * It will be removed as soon as it's not needed anymore.
 *
 *
 * @see {@link https://github.com/sindresorhus/type-fest/blob/main/source/literal-union.d.ts original source}
 * @template LiteralType The literal type
 * @template {Primitive} PrimitiveType The primitive type
 * @typedef {LiteralType | (PrimitiveType & Record<never, never>)} LiteralUnion
 * @example
 * ```ts
 * // Before
 *
 * type Pet = 'dog' | 'cat' | string;
 *
 * const pet: Pet = '';
 * // Start typing in your TypeScript-enabled IDE.
 * // You **will not** get auto-completion for `dog` and `cat` literals.
 *
 * // After
 *
 * type Pet2 = LiteralUnion<'dog' | 'cat', string>;
 *
 * const pet: Pet2 = '';
 * // You **will** get auto-completion for `dog` and `cat` literals.
 * ```
 */

/**
 * Options for `importLocation()`
 *
 * @typedef {ExecuteOptions & ArchiveOptions} ImportLocationOptions
 */

/**
 * Options for `importLocation()` necessary (but not sufficient--see
 * {@link ReadNowPowers}) for dynamic require support
 *
 * @typedef {ExecuteOptions & SyncArchiveOptions} SyncImportLocationOptions
 */

/**
 * Options for `captureFromMap()`
 *
 * @typedef CaptureOptions
 * @property {ModuleTransforms} [moduleTransforms]
 * @property {SyncModuleTransforms} [syncModuleTransforms]
 * @property {Record<string, any>} [modules]
 * @property {boolean} [dev]
 * @property {SomePolicy} [policy]
 * @property {Set<string>} [tags] deprecated in favor of `conditions`
 * @property {Set<string>} [conditions]
 * @property {ExitModuleImportHook} [importHook]
 * @property {Array<string>} [searchSuffixes]
 * @property {Record<string, string>} [commonDependencies]
 * @property {SourceMapHook} [sourceMapHook]
 * @property {Record<string, ParserImplementation>} [parserForLanguage]
 * @property {LanguageForExtension} [languageForExtension]
 * @property {ExitModuleImportNowHook} [importNowHook]
 */

/**
 * The result of `captureFromMap()`
 *
 * @typedef CaptureResult
 * @property {CompartmentMapDescriptor} captureCompartmentMap
 * @property {Sources} captureSources
 * @property {Record<string, string>} compartmentRenames
 */

/**
 * Options object for `chooseModuleDescriptor`.
 *
 * @typedef ChooseModuleDescriptorOptions
 * @property {string[]} candidates List of `moduleSpecifier` with search
 * suffixes appended
 * @property {CompartmentDescriptor} compartmentDescriptor Compartment
 * descriptor
 * @property {Record<string, CompartmentDescriptor>} compartmentDescriptors All
 * compartment descriptors
 * @property {Record<string, Compartment>} compartments All compartments
 * @property {HashFn} [computeSha512] Function to compute SHA-512 hash
 * @property {Record<string, ModuleDescriptor>} moduleDescriptors All module
 * descriptors
 * @property {string} moduleSpecifier Module specifier
 * @property {string} packageLocation Package location
 * @property {CompartmentSources} packageSources Sources
 * @property {ReadPowers|ReadFn} readPowers Powers
 * @property {SourceMapHook} [sourceMapHook] Source map hook
 * @property {(compartmentName: string) => Set<string>} strictlyRequiredForCompartment Function
 *   returning a set of module names (scoped to the compartment) whose parser is not using
 *   heuristics to determine imports.
 */

/**
 * Operators for `chooseModuleDescriptor` representing synchronous operation.
 *
 * @typedef SyncChooseModuleDescriptorOperators
 * @property {MaybeReadNowFn} maybeRead A function that reads a file, returning
 * its binary contents _or_ `undefined` if the file is not found
 * @property {ParseFn} parse A function which parses the (defined) binary
 * contents from `maybeRead` into a `ParseResult`
 * @property {never} [shouldDeferError] Should be omitted.
 */

/**
 * Operators for `chooseModuleDescriptor` representing asynchronous operation.
 *
 * @typedef AsyncChooseModuleDescriptorOperators
 * @property {MaybeReadFn} maybeRead A function that reads a file, resolving w/
 * its binary contents _or_ `undefined` if the file is not found
 * @property {ParseFnAsync|ParseFn} parse A function which parses the (defined)
 * binary contents from `maybeRead` into a `ParseResult`
 * @property {(language: Language) => boolean} shouldDeferError A function that
 * returns `true` if the language returned by `parse` should defer errors.
 */

/**
 * Either synchronous or asynchronous operators for `chooseModuleDescriptor`.
 *
 * @typedef {AsyncChooseModuleDescriptorOperators | SyncChooseModuleDescriptorOperators} ChooseModuleDescriptorOperators
 */

/**
 * The agglomeration of things that the `chooseModuleDescriptor` generator can
 * yield.
 *
 * The generator does not necessarily yield _all_ of these; it depends on
 * whether the operators are {@link AsyncChooseModuleDescriptorOperators} or
 * {@link SyncChooseModuleDescriptorOperators}.
 *
 * @typedef {ReturnType<ChooseModuleDescriptorOperators['maybeRead']> |
 * ReturnType<ChooseModuleDescriptorOperators['parse']>} ChooseModuleDescriptorYieldables
 */

/**
 * Parameters for `findRedirect()`.
 *
 * @typedef FindRedirectParams
 * @property {CompartmentDescriptor} compartmentDescriptor
 * @property {Record<string, CompartmentDescriptor>} compartmentDescriptors
 * @property {Record<string, Compartment>} compartments
 * @property {string} absoluteModuleSpecifier A module specifier which is an absolute path. NOT a file:// URL.
 * @property {string} packageLocation Location of the compartment descriptor's package
 */

/**
 * Options for `makeMapParsers()`
 *
 * @typedef MakeMapParsersOptions
 * @property {ParserForLanguage} parserForLanguage Mapping of language to
 * {@link ParserImplementation}
 * @property {ModuleTransforms} [moduleTransforms] Async or sync module
 *   transforms. If non-empty, dynamic requires are unsupported.
 * @property {SyncModuleTransforms} [syncModuleTransforms] Sync module
 *   transforms
 */

/**
 * The value returned by `makeMapParsers()`
 *
 * @template {ParseFn|ParseFnAsync} [T=ParseFn|ParseFnAsync]
 * @callback MapParsersFn
 * @param {LanguageForExtension} languageForExtension Mapping of file extension
 *   to {@link Language}
 * @param {LanguageForModuleSpecifier} languageForModuleSpecifier Mapping of
 *   module specifier to {@link Language}
 * @returns {T} Parser function
 */
