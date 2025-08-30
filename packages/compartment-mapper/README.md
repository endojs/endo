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

## Evaluating an application from a file system

The `importLocation` function evaluates a compartmentalized application off the
file system.
The `globals` are properties to add to the `globalThis` in the global scope
of the application's main package compartment.
The `modules` are built-in modules to grant the application's main package
compartment.

```js
import fs from "fs";
import { fileURLToPath } from "url";
import { importLocation } from "@endo/compartment-mapper";

// ...

const read = async location => fs.promises.readFile(fileURLToPath(location));

const { namespace: moduleExports } = await importLocation(
  read,
  moduleSpecifier,
  {
    globals: { console },
    modules: { fs },
  },
);
```

The compartment mapper does nothing to arrange for the realm to be frozen.
The application using the compartment mapper is responsible for applying the
[SES] shim (if necessary) and calling `lockdown` to freeze the realm (if
necessary).
The compartment mapper is also not coupled specifically to Node.js IO and does
not import any powerful modules like `fs`.
The caller must provide read powers in the first argument as either a ReadPowers
object or as a standalone `read` function. ReadPowers has optional functions
which can be used to unlock compatibility features. When `fileURLToPath` is
available, `__dirname` and `__filename` will be provided to CJS modules. When
`requireResolve` is available, it will be called whenever a CJS module calls
[`require.resolve()`].

```ts
type ReadPowers = {
  read: (location: string) => Promise<Uint8Array>,
  canonical: (location: string) => Promise<string>,
  computeSha512?: (bytes: Uint8Array) => string,
  fileURLToPath?: (location: string | URL) => string,
  pathToFileURL?: (path: string) => URL,
  requireResolve?: (
    fromLocation: string,
    specifier: string,
    options?: { paths?: string[] },
  ) => string
}
```

A compartment map may include a `policy` that the Compartment Mapper will then
respect at runtime to attenuate access to globals and host built-in modules and
cross-package linkage.
The policy schema follows the structure defined in
[`src/types/policy-schema.ts`](./src/types/policy-schema.ts), where each
compartment can specify:
- **`packages`**: Control over which other packages can be imported
- **`globals`**: Access to global variables and functions
- **`builtins`**: Access to built-in modules like `fs`, `crypto`, etc.
- **`defaultAttenuator`**: Default attenuation strategy for the compartment

For a working example of policies in action, see the [Policy Demo](demo/policy/README.md).

The `importLocation` function internally uses `loadLocation`.
Use `loadLocation` to defer execution or evaluate multiple times with varying
globals or modules in the same process.
`loadLocation` returns an Application object with an
`import({ globals?, modules? })` method.

## Writing an application archive

Use `writeArchive` to capture an application in an archival format.
Archives are `zip` files with a `compartment-map.json` manifest file.

```js
import fs from "fs";
import { fileURLToPath } from "url";
import { writeArchive } from "@endo/compartment-mapper";

const read = async location => fs.promises.readFile(fileURLToPath(location));
const write = async (location, content) =>
  fs.promises.writeFile(fileURLToPath(location), content);

const moduleSpecifier = new URL('app.js', import.meta.url).toString();
const archiveLocation = new URL('app.zip', import.meta.url).toString();

// Write to `archiveLocation`.
await writeArchive(write, read, archiveLocation, moduleSpecifier);
```

The `writeArchive` function internally uses `makeArchive`.
Using `makeArchive` directly gives you the archive bytes.

## Evaluating an application from an archive

Use `importArchive` to run an application from an archive.
Note the similarity to `importLocation`.

```js
import fs from "fs";
import { fileURLToPath } from "url";
import { importArchive } from "@endo/compartment-mapper";

// ...

const read = async location => fs.promises.readFile(fileURLToPath(location));

const { namespace: moduleExports } = await importArchive(
  read,
  archiveLocation,
  {
    globals: { console },
    modules: { fs },
  },
);
```

The `importArchive` function internally composes `loadArchive` and
`parseArchive`.
Use `loadArchive` to defer execution or run multiple times with varying
globals or modules in the same process.
Use `parseArchive` to construct a runner from the bytes of an archive.
`loadArchive` and `parseArchive` return an Application object with an
`import({ globals?, modules? })` method.

`loadArchive` and `parseArchive` do not run the archived application,
so they can be used to safely check its hash.

# Script bundles

From `@endo/compartment-mapper/script.js`, the `makeScript` function is similar
to `makeArchive` but generates a string of JavaScript suitable for `eval` or
embedding in a web page with a `<script>`.
Endo uses this "bundle" format to bootstrap an environment up to the point it
can call `importArchive`, so bundles are at least suitable for creating a
script that subsumes `ses`, `@endo/compartment-mapper/import-archive.js`, and
other parts of Endo, but is not as feature-complete as `importArchive`.

```js
import url from "url";
import fs from "fs";
import { makeScript } from "@endo/compartment-mapper/script.js";
import { makeReadPowers } from "@endo/compartment-mapper/node-powers.js";
const readPowers = makeReadPowers({ fs, url });
const options = {}; // if any
const script = await makeScript(readPowers, moduleSpecifier, options);
```

The script is suitable for evaluating as a script in a web environment.
The script is in UTF-8 format and uses non-ASCII characters, so may require
headers or tags to specify the encoding.

```html
<meta charset="utf-8">
<script src="script.js"></script>
```

Evaluation of `script` returns the emulated exports namespace of the entry
module.

```js
const script = await makeScript(readPowers, moduleSpecifier, options);

// This one weird trick evaluates your script in global scope instead of
// lexical scope.
const globalEval = eval;
const moduleExports = globalEval(script);
```

Scripts can include ESM, CJS, and JSON modules, but no other module languages
like bytes or text.

> [!WARNING]
> Scripts do not support [live
> bindings](https://developer.mozilla.org/en-US/docs/Glossary/Binding), dynamic
> `import`, or `import.meta`.
> Scripts do not isolate modules to a compartment.

`makeScript` accepts all the options of `makeArchive` and:

- `sourceUrlPrefix` (string, default `""`):
  Specifies a prefix to occur on each module's `sourceURL` comment, as injected
  at runtime.
  Should generally end with `/` if non-empty.
  This can improve stack traces.
- `format` (`"cjs"` or `undefined`, default `undefined`):
  By default, `makeBundle` generates a bundle that can be evaluated in any
  context.
  By specifying `"cjs"`, the bundle can assume there is a host CommonJS
  `require` function available for resolving modules that exit the bundle.
  The default is `require` on `globalThis`.
  The `require` function can be overridden with a curried runtime option.
- `useEvaluate` (boolean, default `false`):
  Disabled by default, for bundles that may be embedded on a web page with a
  `no-unsafe-eval` Content Security Policy.
  Enable for any environment that can use `eval` or other suitable evaluator
  (like a Hardened JavaScript `Compartment`).

  By default and when `useEvaluate` is explicitly `false`, the text of a module
  includes an array of module evaluator functions.

  > [!WARNING]
  > Example is illustrative and neither a compatibility guarantee nor even
  > precise.

  ```js
  (modules => options => {
    /* ...linker runtime... */
    for (const module of modules) {
      module(/* linking convention */);
    }
  )([
  // 1. bundle ./dependency.js
  function () { /* ... */ },
  // 2. bundle ./dependent.js
  function () { /* ... */ },
  ])(/* runtime options */)
  ```

  Each of these functions is generated by [Endo's emulation of a JavaScript
  `ModuleSource`
  constructor](https://github.com/endojs/endo/blob/master/packages/module-source/DESIGN.md),
  which we use elsewhere in the Compartment Mapper to emulate Compartment
  module systems at runtime, as in the Compartment Mapper's own `importArchive`.

  With `useEvaluate`, the script instead embeds the text for each module as a
  string, along with a package-relative source URL, and uses an `eval` function
  to produce the corresponding `function`.

  ```js
  (modules => options => {
    /* ...linker runtime... */
    for (const [module, sourceURL] of modules) {
      evalWithSourceURL(module, sourceURL)(/* linking convention */);
    }
  )([
  // 1. bundle ./dependency.js
  ["(function () { /* ... */ })", "bundle/dependency.js"],
  // 2. bundle ./dependent.js
  ["(function () { /* ... */ })", "bundle/dependent.js"],
  ])(/* runtime options */)
  ```

  With `useEvaluate`, the bundle will instead capture a string for
  each module function and use an indirect `eval` to revive them.
  This can make the file locations and line numbers in stack traces more
  useful.

From `@endo/compartment-mapper/script-lite.js`, the `makeScriptFromMap` takes
a compartment map, like that generated by `mapNodeModules` in
`@endo/compartment-mapper/node-modules.js` instead of the entry module's
location.
The `-lite.js` modules, in general, do not entrain a specific compartment
mapper.

# Functor bundles

From `@endo/compartment-mapper/functor.js`, the `makeFunctor` function is similar
to `makeScript` but generates a string of JavaScript suitable for `eval` but *not*
suitable for embedding as a script. But, the completion value of the script
is a function that accepts runtime options and returns the entry module's emulated
module exports namespace, adding a level of indirection.

In this example, we use a Hardened JavaScript `Compartment` to confine the
execution of the functor and its modules.

```js
const functorScript = await makeFunctor(readPowers, moduleSpecifier, options);
const compartment = new Compartment();
const moduleExports = compartment.evaluate(functorScript)({
  require,
  evaluate: compartment.evaluate,
  sourceUrlPrefix: 'file:///Users/you/project/',
});
```

The functor runtime options include:

- `evaluate`: for functors made with `useEvaluate`,
  specifies a function to use to evaluate each module.
  The default evaluator is indirect `eval`.
- `require`: for functors made with `format` of `"cjs"`, provides the behavior
  for `require` calls that exit the bundle to the host environment.
  Defaults to the `require` in lexical scope.
- `sourceUrlPrefix`: specifies a prefix to occur on each module's `sourceURL` comment,
  as injected at runtime.
  Overrides the `sourceUrlPrefix` provided to `makeFunctor`, if any.

From `@endo/compartment-mapper/functor-lite.js`, the `makeFunctorFromMap` takes
a compartment map, like that generated by `mapNodeModules` in
`@endo/compartment-mapper/node-modules.js` instead of the entry module's
location.
The `-lite.js` modules, in general, do not entrain a specific compartment
mapper.

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

The `exports` property describes [package entry points] and can be influenced
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

> [!NOTE]
> Future versions may also respect the `imports` property.
> See [issue #2898](https://github.com/endojs/endo/issues/2898) for more details.

> [!NOTE]
> TODO: A future version may also respect wildcard patterns in `exports` and
> `imports`.

The `files` property indicates all of the files in the package that
should be vended out to applications.
The file set implicitly includes all `**.js`, `**.mjs`, and `**.cjs` files.
The file set implicitly excludes anything under `node_modules`.

With the compartment mapper, just as in Node.js, a module specifier that has no
extension may refer either to the file with the `js` extension, or if that file
does not exist, to the `index.js` file in the directory with the same name.

## Language Extensions

Node.js version 14 or greater treats `.mjs` files as ECMAScript modules and
`.cjs` files as CommonJS modules.
The `.js` extension indicates a CommonJS module by default, to maintain
backward compatibility.
However, packages with `type` "module" will treat a `.js` file as an ECMAScript
module.

Many Node.js applications using CommonJS modules expect to be able to `require`
a JSON file like `package.json`.
The compartment mapper therefore supports loading JSON modules from any type of
module, but using this feature may limit compatibility with the Node.js platform
(in which importing a JSON module requires [import attributes] including
`type: "json"`).

The compartment mapper supports loading CommonJS modules from ECMAScript
modules as well as loading ECMAScript modules from CommonJS modules.
This presumes that the CommonJS modules exclusively use `require` calls with a
single string argument, where `require` is not lexically bound, to declare
their shallow dependencies, so that these modules and their transitive
dependencies can be loaded before any module executes.
Use of this feature may limit compatibility with the Node.js platform, which did
not support loading ECMAScript modules from CommonJS modules until version 22.

The compartment mapper supports language plugins.
The languages supported by default are:

- `mjs` for ECMAScript modules,
- `cjs` for CommonJS modules,
- `json` for JSON modules,
- `text` for UTF-8 encoded text files,
- `bytes` for any file, exporting a `Uint8Array` as `default`,
- `pre-mjs-json` for pre-compiled ECMAScript modules captured as JSON in
  archives, and
- `pre-cjs-json` for pre-compiled CommonJS modules captured as JSON in
  archives.

The compartment mapper accepts extensions to this set of languages with
the `parserForLanguage` option supported by many functions.
See [src/types/external.ts](./src/types/external.ts) for the type and expected
behavior of parsers.

These language identifiers are keys for the `moduleTransforms` and
`syncModuleTransforms` options, which may map each language to a transform
function.
The language identifiers are also the values for a `languageForExtension`,
`moduleLanguageForExtension`, and `commonjsLanguageForExtension` options to
configure additional extension-to-language mappings for a module and its
transitive dependencies.

For any package that has `type` set to "module" in its `package.json`,
`moduleLangaugeForExtension` will precede `languageForExtension`.
For any packages with `type` set to "commonjs" or simply not set,
`commonjsLanguageForExtension` will precede `languageForExtension`.
This provides an hook for mapping TypeScript's `.ts` to either `.cts` or
`.mts`.

The analogous `workspaceLanguageForExtension`,
`workspaceCommonjsLanguageForExtension`, and
`workspaceModuleLanguageForExtension` options apply more specifically for
packages that are not under a `node_modules` directory, indicating that they
are in the set of linked workspaces and have not been built or published to
npm.

In the scope any given package, the `parsers` property in `package.json` may
override the extension-to-language mapping.

```json
{
  "parsers": { "png": "bytes" }
}
```

> [!NOTE]
> Future versions of the compartment mapper may add support for
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

> [!NOTE]
> Future versions of the compartment mapper may also add support for compartment map plugins
> that would recognize packages in `devDependencies` that need to introduce
> globals.
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

# XS (experimental)

The Compartment Mapper can use native XS `Compartment` and `ModuleSource` under
certain conditions:

1. The application must be an XS script that was compiled with the `xs`
  package condition.
  This causes `ses`, `@endo/module-source`, and `@endo/import-bundle` to
  provide slightly different implementations that can fall through to native
  behavior.
2. The application must opt-in with the `__native__: true` option on any
  of the compartment mapper methods that import modules like `importLocation`
  and `importArchive`.

# Design

Each workflow of the compartment mapper executes a portion of a sequence
of underlying internals.

* search ([search.js](./src/search.js)): Scan the parent directories of a given
  `moduleSpecifier` until successfully finding and reading a `package.json` for
  the containing application.
* map compartments from Node.js packages
  ([node-modules.js](./src/node-modules.js)): Find and gather all the
  `package.json` files for the application's transitive dependencies.
  Use these to construct a compartment map describing how to construct a
  `Compartment` for each application package and how to link the modules each
  exports in the compartments that import them.
* load compartments ([archive.js](./src/archive.js)): Using `compartment.load`,
  or implicitly through `compartment.import`, create a module graph for the
  application's entire working set.
  When creating an archive, this does not execute any of the modules.
  The compartment mapper uses the compartments and a special `importHook` that
  records the text of every module the main module needed.
* import modules ([import.js](./src/import.js),
  [import-archive.js](./src/import-archive.js)): Actually execute the working
  set.

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
};

// Location is the URL relative to the compartment-map.json's
// containing location to the compartment's files.
type Location = string;

// ModuleMap describes modules available in the compartment
// that do not correspond to source files in the same compartment.
type ModuleMap = Record<InternalModuleSpecifier, Module>;

// Module describes a module in a compartment.
type Module = CompartmentModule | FileModule | ExitModule;

// CompartmentModule describes a module that may be in the same or a different
// compartment and how to introduce it to the compartment's module namespace.
type CompartmentModule = {
  // The name of the foreign compartment:
  // When absent, defaults to the current compartment (internal alias).
  compartment?: CompartmentName,
  // The name of the module in the foreign compartment's
  // module namespace:
  module?: ExternalModuleSpecifier,
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
// A later, experimental version permitted importing JSON, inferring the module
// format from the module specifier's extension.
// Node.js 23.1 added formal support for importing JSON but requires an
// explicit `with { type: "json" }` import attribute.
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
```

# Compartment map policy

The `policy` option accepted by the compartment-mapper API methods provides means to narrow down the endowments passed to each compartment independently.  
The rules defined by policy get preserved in the compartment map and enforced in the application. To explore how policies work, see [Policy Demo].

The shape of the `policy` object is based on `policy.json` from LavaMoat. MetaMask's [LavaMoat] generates a `policy.json` file that serves the same purposes, using a tool called TOFU: _trust on first use_.

> [!NOTE]
> Endo policy support is intended to reach parity with LavaMoat's
> policy.json.
> Policy generation may be ported to Endo in future versions.

  [LavaMoat]: https://github.com/LavaMoat/lavamoat
  [Compartments]: ../ses/README.md#compartment
  [Policy Demo]: ./demo/policy/README.md
  [import attributes]: https://nodejs.org/docs/latest/api/esm.html#import-attributes
  [package entry points]: https://nodejs.org/api/esm.html#esm_package_entry_points
  [`require.resolve()`]: https://nodejs.org/docs/latest/api/modules.html#requireresolverequest-options
