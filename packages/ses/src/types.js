// @ts-check
//
/**
 * @callback ModuleMapHook
 * @param {string} moduleSpecifier
 * @returns {string | ModuleExportsObject | undefined}
 */

/**
 * @callback ImportHook
 * @param {string} moduleSpecifier
 * @returns {Promise<StaticModuleType>}
 */

/**
 * @callback ResolveHook
 * @param {string} partialModuleSpecifier
 * @param {string} referrerModuleSpecifier
 * @returns {string} resolve module specifier
 */

/**
 * @typedef {RedirectStaticModuleInterface | FinalStaticModuleType} StaticModuleType
 */

/**
 * @typedef {Object} RedirectStaticModuleInterface
 * @property {FinalStaticModuleType} record
 * @property {string} specifier - the module specifier of the other module within
 * the same compartment.
 */

/**
 * @typedef {StaticModuleRecord | ThirdPartyModuleInterface} FinalStaticModuleType
 */

/**
 * @typedef {string | symbol} stringOrSymbol
 */

/**
 * @typedef {(source: string) => string} Transform
 */

/**
 * @typedef {Object} ThirdPartyModuleInterface
 * @property {Readonly<Array<string>>} imports
 * @property {ExecuteFn} execute
 * @readonly
 */

/**
 * @callback ExecuteFn
 * @param {ModuleExportsObject} exports
 * @param {Compartment} compartment
 * @param {Record<string, string>} resolvedImports
 */

/**
 * @typedef {Record<stringOrSymbol, Readonly<unknown>>} ModuleExportsNamespace
 */

/**
 * @typedef {Record<stringOrSymbol, unknown>} ModuleExportsObject
 * A mutable variation on ModuleExportsNamespace, for objects posing
 * as module exports for moduleMapHooks, and for the mutable internal
 * representation of module exports passed to third-party-module executors.
 */

/**
 * @typedef {stringOrSymbol | ModuleExportsObject} ModuleMapValue
 * The values of a module map may be strings, in which case they refer to
 * static module records present in the compartment by inheritance from their
 * incubating compartment, or an object with properties representing the
 * module's exports.  An actual module namespace object of course qualifies.
 */

/**
 * @callback Compartment
 * @class
 *
 * Each Compartment constructor is a global. A host that wants to execute
 * code in a context bound to a new global creates a new compartment.
 *
 * @param {Record<stringOrSymbol, unknown>} [endowments]
 * @param {Record<string, ModuleMapValue>} [_moduleMap]
 * @param {Object} [options]
 * @param {string} [options.name]
 * @param {Array<Transform>} [options.transforms]
 * @param {Array<Transform>} [options.__shimTransforms__]
 * @param {Record<string, unknown>} [options.globalLexicals]
 * @param {ModuleMapHook} [options.moduleMapHook]
 * @param {ResolveHook} [options.resolveHook]
 * @param {ImportHook} [options.importHook]
 *
 * @property {LoadFn} load
 */

/**
 * @callback LoadFn
 * @param {string} moduleSpecifier
 * @returns {Promise<void>}
 */

/**
 * @callback MakeCompartmentConstructor
 * @param {MakeCompartmentConstructor} targetMakeCompartmentConstructor
 * @param {Object} intrinsics
 * @param {(object: Object) => void} nativeBrander
 * @returns {typeof Compartment.constructor}
 */
