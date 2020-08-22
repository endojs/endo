
# Endo Design

Each of the workflows Endo executes a portion of one sequence of underlying
internals.

* search (`search.js`): Scan the parent directories of a given `moduleLocation`
  until successfully finding and reading a `package.json` for the containing
  application.
* map compartments (`compartmap.js`): Find and gather all the `package.json`
  files for the application's transitive dependencies.
  Use these to construct a compartment map describing how to construct a
  `Compartment` for each application package and how to link the modules each
  exports in the compartments that import them.
* load compartments (`archive.js`): Using `compartment.load`, or
  implicitly through `compartment.import`, create a module graph for the
  application's entire working set.
  When creating an archive, this does not execute any of the modules.  Endo
  uses the compartments and a special `importHook` that records the text of
  every module the main module needed.
* import modules (`import.js`, `import-archive.js`): Actually
  execute the working set.

Around this sequence, we can enter late or depart early to store or retrieve an
archive.
Endo provides workflows that use `read` and `write` hooks when interacting
with a filesystem or work with the archive bytes directly.

This diagram represents the the workflows of each of the public methods like
`importLocation`.
Each column of pipes `|` is a workflow from top to bottom.
Each asterisk `*` denotes a step that is taken by that workflow.
The functions `loadArchive` and `parseArchive` partially apply `importArchive`,
so the pluses `+` indicate the steps taken in continuation.
The dotted lines `.'. : '.'` indicate carrying an archive file from the end of
one workflow to the beginning of another, either as bytes or a location.

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
         read archive ->  | |  | |  '   * * *  : :
       unpack archive ->  | |  | |  :   * * *  : :
assemble compartments ->  * *  * *  :   + + *  : : <- endowments
    load compartments ->  * *  * *  :   + + *  : :
       import modules ->  *    | |  :   + + *  : :
         pack archive ->       * *  '          : :
        write archive ->       * '.' <- data   : :
                               '..............'  : <- files
                                '...............'
```

> TODO
>
> A future version of Endo may introduce a command line for:
>
> * Sandboxing Node.js applications by using `endo` just as you would use
>   `node`.
> * Passing additional `endo` command line arguments to grant common
>   attenuated powers like the built-in `fs` module with limited read access
>   `--read .` the `net` and `http` modules with limited authority `--net
>   example.com`, or the standard input and output.
> * Allowing application authors to express policies that extend
>   the availability of limited powers like access to the `fs` module
>   or standard input and output streams to third-party packages.
> * Creating application archives and running them, with `endo --pack app.agar
>   app.js` and `endo --archive app.agar`.

> TODO
>
> A future version of Endo may introduce support for web clients.
> This would support separate modes for development (without a build step) and
> production (demarcated by a build step).
>
> For development, Endo would provide a `compartmap` tool that would build
> a `compartmap.json` each time the dependency graph changes or when
> endowment policies change.
> To run an Endo application on the web, the developer would introduce
> a `<script src="node_modules/endo/web.js" import="./app.js"
> compartmap="compartmap.json">`.
> The `import` and `compartmap` might have sensible defaults.
>
> For production, Endo would provide a build step similar to the archiver,
> but without the archive envelope.

> TODO
>
> A future version of Endo may add support for generalized workers: workers
> that would be introduced to compartments as endowments and have the same usage
> but different implementations when running in Node.js, in Node.js from an
> archive, or on the web.
> The developer would introduce the worker entry module and desired name in
> their `package.json`.
>
> For this example, we presume the existence of a "promise worker" calling
> convention, where the parent worker gets a promise for the "remote presence"
> of the worker's exported namespace.
>
> ```json
> {
>   "promise-workers": {
>     "MyPromiseWorker": "./my-worker.js"
>   }
> }
> ```
>
> In that package, Endo would introduce the worker as a global.
>
> ```js
> const worker = new MyPromiseWorker();
> ```


## Compartment Maps

Endo at the command line works by generating a _compartment map_ from
your application workspace and all of the `node_modules` it needs.
A compartment map is similar to a lock file because it collects information
from all of the installed modules.
A compartment map describes how to construct compartments for each
package in your application and link their module namespaces.

> TODO
>
> For browser applications, a future version of Endo will ship
> a `compartmap` tool that can be used as a `postinall` script
> to generate a compartment map applications can use _during development_
> to run on the client side without a build step.
>
> This compartment map will include the `browser` tag and all corresponding
> module aliases from the `exports` field in `package.json`.
> The Endo command line tool will always generate a compartment map
> of its own without the `browser` tag and will never use the `compartmap.json`
> file on disk.
>
> A compartment map is similar in spirit to an import map or a package lock.
> The object fully describes how to compose a compartment DAG to run an
> application.
> A compartment map is intended to be generated only when dependencies or
> compartment policies change, not to be drafted by hand, and certainly not to be
> both manually and automatically maintained.
>
> As with an importmap, we can add a postinstall hook to package.json that will
> generate a new compartmap each time the dependency graph of an application
> changes.
>
> ```json
> {
>   "scripts": {
>     "postinstall": "compartmap"
>   }
> }
> ```
>
> We can include this in the scaffolding for compartmentalized applications.
>
> The `compartmap` tool generates a `compartmap.json` file, merging what
> it finds in a `package-lock.json`, `yarn.lock` or some such shrinkwrap,
> or just crawls `node_modules` and finds all the `package.json` files
> as an input.
> Then, it merges a `compolicy.json` if it finds one.
> The default compartment policy is empty, which implies:
>
> * endowments only pass to the main compartment.
> * no package has access to any built-in modules.

The compartment map shape:

```ts
// CompartmentMap describes how to prepare compartments
// to run an application.
type CompartmentMap = {
  tags: Tags,
  main: CompartmentName,
  compartments: Object<CompartmentName, Compartment>,
  realms: Object<RealmName, Realm>, // TODO
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
type Location string;

// ModuleMap describes modules available in the compartment
// that do not correspond to source files in the same compartment.
type ModuleMap = Object<InternalModuleSpecifier, Module>;

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
   location: FileLocation
   parser: Parser
};

// ExitName is the name of a built-in module, to be threaded in from the
// modules passed to the module executor.
type ExitName string;

// ExitModule refers to a module that comes from outside the compartment map.
type ExitModule = {
  exit: ExitName
};

// InternalModuleSpecifier is the module specifier
// in the namespace of the native compartment.
type InternalModuleSpecifier string;

// ExternalModuleSpecifier is the module specifier
// in the namespace of the foreign compartment.
type ExternalModuleSpecifier string;

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
type ParserMap = Object<Extension, Parser>;

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
type ModuleParserMap = Object<InternalModuleSpecifier, Parser>

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
type ScopeMap = Object<InternalModuleSpecifier, Scope>

// Scope describes the compartment to use for all ad-hoc
// entries in the compartment's module map.
type Scope = {
  compartment: CompartmentName
}


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
type RealmName string;

// ModuleParameter indicates that the module does not come from
// another compartment but must be passed expressly into the
// application by the user.
// For example, the Node.js `fs` built-in module provides
// powers that must be expressly granted to an application
// and may be attenuated or limited by Endo on behalf of the user.
// The string value is the name of the module to be provided
// in the application's given module map.
type ModuleParameter string;
```


## Compartment Map Policies

> TODO
>
> At time of writing, Endo only empowers application code to execute
> and log results to the command line.
> A compartment map policy is a file that will sit beside an application that
> expresses what powerful objects should pass into the compartment for each
> package of an application.
>
> MetaMask's [LavaMoat] generates a `lavalmoat.config.json` file that serves
> the same purposes, using a tool called TOFU: _trust on first use_.

  [LavaMoat]: https://github.com/LavaMoat/lavamoat
