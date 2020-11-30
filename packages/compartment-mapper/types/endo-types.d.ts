// https://github.com/Agoric/SES-shim/blob/kris/endo-stack/packages/endo/DESIGN.md#compartment-maps

namespace endo {

// CompartmentMap describes how to prepare compartments
// to run an application.
type CompartmentMap = {
  tags: Tags,
  main: CompartmentName,
  compartments: { [compartmentName: string]: Compartment },
  realms: { [realmName: string]: Realm}, // TODO
};

// Tags are the build tags for the compartment.
// These may include terms like "browser", meaning
// each compartment uses the implementation of each
// module suitable for use in a browser environment.
type Tags = Array<Tag>;
type Tag = string;

// CompartmentName is an arbitrary string to name
// a compartment for purposes of inter-compartment linkage.
type CompartmentName = string;

// Compartment describes where to find the modules
// for a compartment and how to link the compartment
// to modules in other compartments, or to built-in modules.
type Compartment = {
  location: Location,
  modules: ModuleMap,
  parsers: ParserMap,
  types: ModuleParserMap,
  scopes: ScopeMap,
  // The name of the realm to run the compartment within.
  // The default is a single frozen realm that has no name.
  realm: RealmName? // TODO
};

// Location is the URL relative to the compartmap.json's
// containing location to the compartment's files.
type Location = string;

// ModuleMap describes modules available in the compartment
// that do not correspond to source files in the same compartment.
type ModuleMap = { [internalModuleSpecifier: string]: Module };

// Module describes a module in a compartment.
type Module = CompartmentModule | FileModule | ExitModule;

// CompartmentModule describes a module that isn't in the same
// compartment and how to introduce it to the compartment's
// module namespace.
type CompartmentModule = {
  // The name of the foreign compartment:
  // TODO an absent compartment name may imply either
  // that the module is an internal alias of the
  // same compartment, or given by the user.
  compartment: CompartmentName?,
  // The name of the module in the foreign compartment's
  // module namespace:
  module: ExternalModuleSpecifier?,
};

// FileLocation is a URL for a module's file relative to the location of the
// containing compartment.
type FileLocation = string

// FileModule is a module from a file.
// When loading modules off a file system (src/import.js), the assembler
// does not need any explicit FileModules, and instead relies on the
// compartment to declare a ParserMap and optionally ModuleParserMap and
// ScopeMap.
// Endo provides a Compartment importHook and moduleMapHook that will
// search the filesystem for candidate module files and infer the type from the
// extension when necessary.
type FileModule = {
   location: FileLocation,
   parser: Parser,
};

// ExitName is the name of a built-in module, to be threaded in from the
// modules passed to the module executor.
type ExitName = string;

// ExitModule refers to a module that comes from outside the compartment map.
type ExitModule = {
  exit: ExitName
};

// InternalModuleSpecifier is the module specifier
// in the namespace of the native compartment.
type InternalModuleSpecifier = string;

// ExternalModuleSpecifier is the module specifier
// in the namespace of the foreign compartment.
type ExternalModuleSpecifier = string;

// ParserMap indicates which parser to use to construct static module records
// from sources, for each supported file extension.
// For parity with Node.js, a package with `"type": "module"` in its
// `package.json` would have a parser map of `{"js": "mjs", "cjs": "cjs",
// "mjs": "mjs"}`.
// If `"module"` is not defined in package.json, the legacy parser map // is
// `{"js": "cjs", "cjs": "cjs", "mjs": "mjs"}`.
// Endo adds `{"json": "json"}` for good measure in both cases, although
// Node.js (as of version 0.14.5) does not support importing JSON modules from
// ESM.
type ParserMap = { [extension: string]: Parser };

// Extension is a file extension such as "js" for "main.js" or "" for "README".
type Extension = string;

// Parser is a union of built-in parsers for static module records.
// "mjs" corresponds to ECMAScript modules.
// "cjs" corresponds to CommonJS modules.
// "json" corresponds to JSON.
type Parser = "mjs" | "cjs" | "json";

// ModuleParserMap is a table of internal module specifiers
// to the parser that should be used, regardless of that module's
// extension.
// Node.js allows the "module" property in package.json to denote
// a file that is an ECMAScript module, regardless of its extension.
// This is the mechanism that allows Endo to respect that behavior.
type ModuleParserMap = { [internalModuleSpecifier: string]: Parser };

// ScopeMap is a map from internal module specifier prefixes
// like "dependency" or "@organization/dependency" to another
// compartment.
// Endo uses this to build a moduleMapHook that can dynamically
// generate entries for a compartment's moduleMap into
// Node.js packages that do not explicitly state their "exports".
// For these modules, any specifier under that prefix corresponds
// to a link into some internal module of the foreign compartment.
// When Endo creates an archive, it captures all of the Modules
// explicitly and erases the scopes entry.
type ScopeMap = { [internalModuleSpecifier: string]: Scope };

// Scope describes the compartment to use for all ad-hoc
// entries in the compartment's module map.
type Scope = {
  compartment: CompartmentName
};


// TODO everything hereafter...

// Realm describes another realm to contain one or more
// compartments.
// The default realm is frozen by lockdown with no
// powerful references.
type Realm = {
  // TODO lockdown options
};

// RealmName is an arbitrary identifier for realms
// for reference from any Compartment description.
// No names are reserved; the default realm has no name.
type RealmName = string;

// ModuleParameter indicates that the module does not come from
// another compartment but must be passed expressly into the
// application by the user.
// For example, the Node.js `fs` built-in module provides
// powers that must be expressly granted to an application
// and may be attenuated or limited by Endo on behalf of the user.
// The string value is the name of the module to be provided
// in the application's given module map.
type ModuleParameter = string;

}
