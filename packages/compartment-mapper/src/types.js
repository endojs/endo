// @ts-check
/// <reference types="ses"/>

export {};

/** @import {FinalStaticModuleType} from 'ses' */
/** @import {ThirdPartyStaticModuleInterface} from 'ses' */
/** @import {ImportHook} from 'ses' */
/** @import {StaticModuleType} from 'ses' */
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
 * one for a given library or application package.json.
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
 */

/**
 * For every module explicitly mentioned in an `exports` field of a
 * package.json, there is a corresponding module descriptor.
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
 * in a package.json file, when that package.json file does not have
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
 * A resolution of `undefined` indicates `ENOENT` or the equivalent.
 *
 * @callback MaybeReadFn
 * @param {string} location
 * @returns {Promise<Uint8Array | undefined>} bytes
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
 * @typedef {object} ReadPowers
 * @property {ReadFn} read
 * @property {CanonicalFn} canonical
 * @property {HashFn} [computeSha512]
 * @property {Function} [fileURLToPath]
 * @property {Function} [pathToFileURL]
 * @property {Function} [requireResolve]
 */

/**
 * @typedef {ReadPowers | object} MaybeReadPowers
 * @property {MaybeReadFn} maybeRead
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
 * @property {ParseFn} parse
 * @property {ShouldDeferError} shouldDeferError
 * @property {Record<string, Compartment>} compartments
 */

/**
 * @callback ImportHookMaker
 * @param {ImportHookMakerOptions} options
 * @returns {ImportHook}
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
 * @callback ParseFn
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
 * @returns {Promise<{
 *   bytes: Uint8Array,
 *   parser: Language,
 *   record: FinalStaticModuleType,
 *   sourceMap?: string,
 * }>}
 */

/**
 * ParserImplementation declares if a heuristic is used by parser to detect
 * imports - is set to true for cjs, which uses a lexer to find require calls
 *
 * @typedef {object} ParserImplementation
 * @property {boolean} heuristicImports
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
 * @typedef {ArchiveOptions} LoadLocationOptions
 */

/**
 * @see {@link LinkOptions}
 * @typedef {object} ExtraLinkOptions
 * @property {ResolveHook} [resolve]
 * @property {ImportHookMaker} makeImportHook
 * @property {ParserForLanguage} [parserForLanguage]
 * @property {LanguageForExtension} [languageForExtension]
 * @property {ModuleTransforms} [moduleTransforms]
 * @property {boolean} [archiveOnly]
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
 * @callback ModuleTransform
 * @param {Uint8Array} bytes
 * @param {string} specifier
 * @param {string} location
 * @param {string} packageLocation
 * @param {object} [options]
 * @param {string} [options.sourceMap]
 * @returns {Promise<{bytes: Uint8Array, parser: Language, sourceMap?: string}>}
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
 * @property {Record<string, any>} [modules]
 * @property {boolean} [dev]
 * @property {SomePolicy} [policy]
 * @property {Set<string>} [tags]
 * @property {CaptureSourceLocationHook} [captureSourceLocation]
 * @property {ExitModuleImportHook} [importHook]
 * @property {Array<string>} [searchSuffixes]
 * @property {Record<string, string>} [commonDependencies]
 * @property {SourceMapHook} [sourceMapHook]
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
 * @template [T=unknown]
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
 * A type representing a property policy, which is a record of string keys and boolean values.
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
 * Any {@link PackagePolicy}
 *
 * @typedef {PackagePolicy<any, any, any, any>} SomePackagePolicy
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
 * Options for `captureFromMap()`
 *
 * @typedef CaptureOptions
 * @property {ModuleTransforms} [moduleTransforms]
 * @property {Record<string, any>} [modules]
 * @property {boolean} [dev]
 * @property {SomePolicy} [policy]
 * @property {Set<string>} [tags]
 * @property {ExitModuleImportHook} [importHook]
 * @property {Array<string>} [searchSuffixes]
 * @property {Record<string, string>} [commonDependencies]
 * @property {SourceMapHook} [sourceMapHook]
 * @property {Record<string, ParserImplementation>} [parserForLanguage]
 * @property {LanguageForExtension} [languageForExtension]
 */

/**
 * The result of `captureFromMap()`
 *
 * @typedef CaptureResult
 * @property {CompartmentMapDescriptor} captureCompartmentMap
 * @property {Sources} captureSources
 * @property {Record<string, string>} compartmentRenames
 */
