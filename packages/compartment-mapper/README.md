# Compartment mapper

The compartment mapper builds _compartment maps_ for Node.js style
applications, finding their dependencies and describing how to create
[Compartments][] for each package in the application.

Creating a compartment map for a Node.js application allows us to harness
the SES module loader to encapsulate each dependency and grant the least
necessary authority to each third-party package, mitigating prototype pollution
attacks and some supply chain attacks.
Since most Node.js packages do not modify objects in global scope,
many libraries and applications work in Compartments without modification.

The `importLocation` function runs a compartmentalized application off the file
system.
The `globals` are properties to add to the `globalThis` in the global scope
of the application's main package compartment.
The `modules` are built-in modules to grant the application's main package
compartment.

```js
import fs from "fs";
import { importLocation } from "@endo/compartment-mapper";

// ...

const modules = { fs };
const globals = { console };

const read = async location =>
  fs.promises.readFile(new URL(location).pathname);

const { namespace } = await importLocation(
  read,
  moduleLocation,
  {
    globals,
    modules
  }
);
```

The compartment mapper does nothing to arrange for the realm to be frozen.
The application using the compartment mapper is responsible for applying the
[SES] shim (if necessary) and calling `lockdown` to freeze the realm (if
necessary).
The compartment mapper is also not coupled specifically to Node.js IO and does
not import any powerful modules like `fs`.
The user must provide `read` and `write` functions from whatever IO powers they
have. These powers can be provided as individual functions or as objects
carrying functions. `ReadPowers` has optional functions which can be used to
unlock compatibility features. When `fileURLToPath` is available, `__dirname`
and `__filename` will be provided to CJS modules. If `requireResolve` is
available, it will be called whenever a CJS module calls `require.resolve()`.

```js
type ReadPowers = {
  read: (location: string) => Promise<Uint8Array>,
  canonical: (location: string) => Promise<string>,
  computeSha512: { (bytes: Uint8Array) => string }?,
  fileURLToPath: { (url: string | URL) => string }?,
  pathToFileURL: { (path: string) => URL }?,
  requireResolve: { (from: string, request: string, options?: {}) => string }?
}
```

> TODO
>
> A future version will allow application authors to distribute their choices
> of globals and built-in modules to third-party packages within the
> application, as with [LavaMoat].

The `importLocation` function uses `loadLocation`.
Using `loadLocation` directly allows for deferred execution or multiple runs
with different globals or modules in the same process.
Calling `loadLocation` returns an `Application` object with an
`import({ globals?, modules? })` method.

Use `writeArchive` to capture an application in an archival format.
Archives are `zip` files with a `compartment-map.json` manifest file.

```js
import fs from "fs";
import { writeArchive } from "@endo/compartment-mapper";

const read = async location =>
  fs.promises.readFile(new URL(location).pathname);
const write = async (location, content) =>
  fs.promises.writeFile(new URL(location).pathname, content);

await writeArchive(
  write,
  read,
  new URL('app.zip', import.meta.url).toString(), // the archive to write
  new URL('app.js', import.meta.url).toString() // the application to capture
);
```

The `writeArchive` function uses `makeArchive`.
Using `makeArchive` directly gives you the archive bytes.

Use `importArchive` to run an application from an archive.
Note the similarity to `importLocation`.

```js
import fs from "fs";
import { importArchive } from "@endo/compartment-mapper";

// ...

const modules = { fs };
const globals = { console };

const read = async location =>
  fs.promises.readFile(new URL(location).pathname);

const { namespace } = await importArchive(
  read,
  archiveLocation,
  {
    globals,
    modules
  }
);
```

The `importArchive` function composes `loadArchive` and `parseArchive`.
Use `loadArchive` to defer execution or run multiple times with varying
globals.
Use `parseArchive` to construct a runner from the bytes of an archive.
The `loadArchive` and `parseArchive` functions return an `Application`
object with an `import({ globals?, modules? })` method.

`loadArchive` and `parseArchive` do not run the archived program,
so they can be used to check the hash of a program without running it.

# Package Descriptors

The compartment mapper uses [Compartments], one for each Node.js package your
application needs.
The compartment mapper generates a compartment graph from Node.js packaged
module descriptors: the `package.json` files of the application and all its
dependencies.
Consequently, an application must have a `package.json`.

Each package has its own descriptor, `package.json`.
Some standard properties of the descriptor are relevant and used by a
compartment map.

* `name`
* `type`
* `main`
* `exports`
* `browser`
* `dependencies`
* `files`

The compartment map will contain one compartment for each `package.json`
necessary to build the application.
Like Node.js, the compartment mapper trusts the package manager to arrange the
packages such that a satisfactory version of every package's dependencies rests
in a parent directory, under `node_modules`.

The `main`, `browser`, and `exports` properties determine the modules each
package exports to other compartments.

The `exports` property describes [package entry points][] and can be influenced
by build _conditions_.
Currently, the only conditions supported by the compartment mapper are
`import`, `browser`, and `endo`.
The `imports` condition indicates that the module map should use ESM modules
over CommonJS modules or other variants, and `endo`.
The `browser` condition also draws in the `browser` property from
`package.json` instead of `main`.
The `endo` condition only indicates that this tool is in use.

If no `exports` apply to the root of the compartment namespace (`"."`),
the `main` property serves as a default.

> TODO
>
> A future version may also respect the `imports` property.

> TODO
>
> A future version may also respect wildcard patterns in `exports` and
> `imports`.

The `files` property indicates all of the files in the package that
should be vended out to applications.
The file set implicitly includes all `**.js`, `**.mjs`, and `**.cjs` files.
The file set implicitly excludes anything under `node_modules`.

With the compartment mapper, just as in Node.js, a module specifier that has no
extension may refer either to the file with the `js` extension, or if that file
does not exist, to the `index.js` file in the directory with the same name.

> TODO
>
> The compartment mapper does not yet do anything with the `files` globs but a
> future version of the compartment mapper will collect these in archives.
> The compartment mapper should eventually provide the means for any
> compartment to access its own files using an attenuated `fs` module or
> `fetch` global, in conjunction with usable values for `import.meta.url` in
> ECMAScript modules or `__dirname` and `__filename` in CommonJS modules.

Officially beginning with Node.js 14, Node.js treats `.mjs` files as ECMAScript
modules and `.cjs` files as CommonJS modules.
The `.js` extension indicates a CommonJS module by default, to maintain
backward compatibility.
However, packages that have a `type` property that explicitly says `module`
will treat a `.js` file as an ECMAScript module.

This unforunately conflicts with packages written to work with the ECMAScript
module system emulator in the `esm` package on npm, which allows every file
with the `js` extension to be an ECMAScript module that presents itself to
Node.js as a CommonJS module.
To overcome such obstacles, the compartment mapper will accept a non-standard
`parsers` property in `package.json` that maps file extensions, specifically
`js` to the corresponding language name, one of `mjs` for ECMAScript modules,
`cjs` for CommonJS modules, and `json` for JSON modules.
All other language names are reserved and the defaults for files with the
extensions `cjs`, `mjs`, `json`, `text`, and `bytes` default to the language of
the same name unless overridden.
JSON modules export a default object resulting from the conventional JSON.parse
of the module's UTF-8 encoded bytes.
Text modules export a default string from the module's UTF-8 encoded bytes.
Bytes modules export a default ArrayBuffer capturing the module's bytes.
If compartment mapper sees `parsers`, it ignores `type`, so these can
contradict where using the `esm` emulator requires.

```json
{
  "parsers": {"js": "mjs"}
}
```

Many Node.js applications using CommonJS modules expect to be able to `require`
a JSON file like `package.json`.
The compartment mapper supports loading JSON modules from any type of module.
As of Node.js 14, Node does not support importing JSON using ECMAScript
`import` directives, so using this feature may limit compatibility with the
Node.js platform.

The compartment mapper supports loading CommonJS modules from ECMAScript
modules as well as ECMAScript modules importing CommonJS modules.
This presumes that the CommonJS modules exclusively use `require` calls with a
single string argument, where `require` is not lexically bound, to declare
their shallow dependencies, so that these modules and their transitive
dependencies can be loaded before any module executes.
As of Node.js 14, Node does not support loading ECMAScript modules from
CommonJS modules, so using this feature may limit compatibility with the
Node.js platform.

> TODO A future version may introduce language plugins, so a package may state
> that files with a particular extension are either parsed or linked with
> another module.

> TODO
>
> The compartment mapper may elect to respect some properties specified for
> import maps.

> TODO
>
> A future version of the compartment mapper may add support for
> source-to-source translation in the scope of a package or compartment.
> This would be expressed in `package.json` using a property like
> `translate` that would contain a map from file extension
> to a module that exports a suitable translator.
>
> For browser applications, the compartment mapper would use the translator
> modules in two modes.
> During development, the compartment mapper would be able to load the
> translator in the client, with the `browser` condition.
> The compartment mapper would also be able to run the translator in a separate
> non-browser compartment during bundling, so the translator can be excluded
> from the production application and archived applications.

> TODO
>
> The compartment mapper may also add support for compartment map plugins that
> would recognize packages in `devDependencies` that need to introduce globals.
> For example, _packages_ that use JSX and a virtual DOM would be able to add a
> module-to-module translator and endow the compartment with the `h` the
> translated modules need.

# Source Maps

The `makeArchive`, `makeAndHashArchive`, and `writeArchive` tools can receive a
`sourceMapHook` as one of its options.
The `sourceMapHook` receives a source map `string` for every module it
archives, along with details `compartment`, `module`, `location`, and `sha512`.
The `compartment` is the fully-qualified file URL of the package root.
The `module` is the package-relative module specifier.
The `location` is the fully-qualified file URL of the module file.
The `sha512`, if present, was generated with the `computeSha512` power from the
generated module bytes.

The functions `importArchive`, `loadArchive`, and `parseArchive`
tools can receive a `computeSourceMapLocation` option that recives the same
details as above and must return a URL.
These will be appended to each module from the archive, for debugging purposes.

The `@endo/bundle-source` and `@endo/import-bundle` tools integrate source maps
for an end-to-end debugging experience.

# Design

Each of the workflows the compartment mapper executes a portion of one sequence
of underlying internals.

* search (`search.js`): Scan the parent directories of a given `moduleLocation`
  until successfully finding and reading a `package.json` for the containing
  application.
* map compartments from Node.js packages (`node-modules.js`): Find and gather
  all the `package.json` files for the application's transitive dependencies.
  Use these to construct a compartment map describing how to construct a
  `Compartment` for each application package and how to link the modules each
  exports in the compartments that import them.
* load compartments (`archive.js`): Using `compartment.load`, or
  implicitly through `compartment.import`, create a module graph for the
  application's entire working set.
  When creating an archive, this does not execute any of the modules.
  The compartment mapper uses the compartments and a special `importHook` that
  records the text of every module the main module needed.
* import modules (`import.js`, `import-archive.js`): Actually execute the
  working set.

Around this sequence, we can enter late or depart early to store or retrieve an
archive.
The compartment mapper provides workflows that use `read` and `write` hooks
when interacting with a filesystem or work with the archive bytes directly.

This diagram represents the the workflows of each of the public methods like
`importLocation`.
Each column of pipes `|` is a workflow from top to bottom.
Each asterisk `*` denotes a step that is taken by that workflow.
The dotted lines `.'. : '.'` indicate carrying an archive file from the end of
one workflow to the beginning of another, either as bytes or a location.

In the diagram, "powers" refer to globals and built-in modules that may provide
capabilities to a compartment graph.
For `writeArchive` and `makeArchive`, these may be provided but will be ignored
since the application does not execute.

```
                 loadLocation  writeArchive
             importLocation |  | makeArchive
                          | |  | |
                          | |  | |      parseArchive
                          | |  | |      | loadArchive
                          | |  | |      | | importArchive
                          | |  | |      | | |...
               search ->  * *  * *      | |'| . '
     map compartments ->  * *  * *   .'.| | |' : :
         read archive ->  |    | |  '   | * *  : :
       unpack archive ->  |    | |  :   * * *  : :
assemble compartments ->  *    * *  :       *  : : <- powers
    load compartments ->  *    * *  :       *  : :
       import modules ->  *    | |  :       *  : :
         pack archive ->       * *  '          : :
        write archive ->       * '.' <- data   : :
                               '..............'  : <- files
                                '...............'
```

# Compartment maps

The compartment mapper works by generating a _compartment map_ from your
application workspace and all of the `node_modules` it needs.
A compartment map is similar to a lock file because it collects information
from all of the installed modules.
A compartment map describes how to construct compartments for each
package in your application and link their module namespaces.

The compartment map shape:

```ts
// CompartmentMap describes how to prepare compartments
// to run an application.
type CompartmentMap = {
  tags: Conditions,
  entry: Entry,
  compartments: Record<CompartmentName, Compartment>,
  realms: Record<RealmName, Realm>, // TODO
};

// Conditions influence which modules are selected
// to represent the implementation of various modules.
// These may include terms like "browser", meaning
// each compartment uses the implementation of each
// module suitable for use in a browser environment.
type Conditions = Array<Condition>;
type Condition = string;

// Entry is a reference to the module that is the module to initially import.
type Entry = CompartmentModule;

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

// Location is the URL relative to the compartment-map.json's
// containing location to the compartment's files.
type Location = string;

// ModuleMap describes modules available in the compartment
// that do not correspond to source files in the same compartment.
type ModuleMap = Record<InternalModuleSpecifier, Module>;

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
// The compartment mapper provides a Compartment importHook and moduleMapHook
// that will search the filesystem for candidate module files and infer the
// type from the extension when necessary.
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

// ParserMap indicates which parser to use to construct module sources
// from sources, for each supported file extension.
// For parity with Node.js, a package with `"type": "module"` in its
// `package.json` would have a parser map of `{"js": "mjs", "cjs": "cjs",
// "mjs": "mjs"}`.
// If `"module"` is not defined in package.json, the legacy parser map // is
// `{"js": "cjs", "cjs": "cjs", "mjs": "mjs"}`.
// The compartment mapper adds `{"json": "json"}` for good measure in both
// cases, although Node.js (as of version 0.14.5) does not support importing
// JSON modules from ESM.
type ParserMap = Record<Extension, Parser>;

// Extension is a file extension such as "js" for "main.js" or "" for "README".
type Extension = string;

// Parser is a union of built-in parsers for module sources.
// "mjs" corresponds to ECMAScript modules.
// "cjs" corresponds to CommonJS modules.
// "json" corresponds to JSON.
type Parser = "mjs" | "cjs" | "json";

// ModuleParserMap is a table of internal module specifiers
// to the parser that should be used, regardless of that module's
// extension.
// Node.js allows the "module" property in package.json to denote
// a file that is an ECMAScript module, regardless of its extension.
// This is the mechanism that allows the compartment mapper to respect that
// behavior.
type ModuleParserMap = Record<InternalModuleSpecifier, Parser>;

// ScopeMap is a map from internal module specifier prefixes
// like "dependency" or "@organization/dependency" to another
// compartment.
// The compartment mapper uses this to build a moduleMapHook that can dynamically
// generate entries for a compartment's moduleMap into Node.js packages that do
// not explicitly state their "exports".
// For these modules, any specifier under that prefix corresponds
// to a link into some internal module of the foreign compartment.
>> When the compartment mapper creates an archive, it captures all of the Modules
>> explicitly and erases the scopes entry.
type ScopeMap = Record<InternalModuleSpecifier, Scope>;

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
// and may be attenuated or limited by the compartment mapper on behalf of the
// user.
// The string value is the name of the module to be provided
// in the application's given module map.
type ModuleParameter = string;
```

# Compartment map policy

The `policy` option accepted by the compartment-mapper API methods provides means to narrow down the endowments passed to each compartment independently.  
The rules defined by policy get preserved in the compartment map and enforced in the application. To explore how policies work, see [Policy Demo].

The shape of the `policy` object is based on `policy.json` from LavaMoat. MetaMask's [LavaMoat] generates a `policy.json` file that serves the same purposes, using a tool called TOFU: _trust on first use_.

> TODO
>
> Endo policy support is intended to reach parity with LavaMoat's policy.json.
> Policy generation may be ported to Endo.


  [LavaMoat]: https://github.com/LavaMoat/lavamoat
  [Compartments]: ../ses/README.md#compartment
  [Policy Demo]: ./demo/policy/README.md
  [package entry points]: https://nodejs.org/api/esm.html#esm_package_entry_points
