# Endo

Endo runs Node.js packages in a sandbox.

Each Node.js package runs in a separate [compartment][Compartments] of a single
immutable realm.
Each compartment may be given limited access to powerful
modules like `fs` and powerful globals like `fetch`.

Endo can also construct an archive that bundles all of the packages and modules
needed to run an Endo command, then run an application directly from an
archive.

Currently Endo supports running packages consisting entirely of ECMAScript
modules (ESM) that do not depend upon any powerful built-in modules or
facilities of global scope at the command line.

Future versions may support:

* CommonJS modules,
* Passing powerful and powerless built-in modules and globals into specific
  compartments based on application policies,
* Realm isolation,
* Running vetted shims in a realm before [lockdown].
* Threading endowments,
* Threading built-in modules,
* Membranes or tamper-proofing between packages,
* Extensions for module and program translation scoped to each compartment,
* Running Endo applications on the web without a build step.
* Generalized support for workers under Node or on the web.
* An `importmap` superset.

  [compartment]: https://github.com/Agoric/SES-shim/blob/master/packages/ses/README.md#compartment
  [lockdown]: https://github.com/Agoric/SES-shim/blob/master/packages/ses/README.md#lockdown


## Usage

Endo runs your application in a single frozen realm, endowing only the main
compartment with the given powerful global properties and built-in modules.

The `importLocation` function runs a compartmentalized application off the file
system.
The `endowments` are properties to add to the `globalThis` in the global scope
of the application's main package compartment.
The `modules` are built-in modules to grant the application's main package
compartment.

```js
import fs from "fs";
import { importLocation } from "endo";

// ...

const modules = { fs };
const endowments = { console };

const read = async location =>
  fs.promises.readFile(new URL(location).pathname);

const { namespace } = await importLocation(
  read,
  moduleLocation,
  endowments,
  modules
);
```

Endo does nothing to arrange for the realm to be frozen.
The application using Endo is responsible for applying the [SES] shim (if
necessary) and calling `lockdown` to freeze the realm (if necessary).
Endo is also not coupled to Node.js IO and does not import any powerful
modules like `fs`.
The user must provide `read` and `write` functions from whatever IO
powers they have.

> TODO
>
> A future version will allow application authors to distribute
> their global endowments and granted built-in modules to third-party
> packages within the application, as with [LavaMoat].

The `importLocation` function uses `loadLocation`.
Using `loadLocation` directly allows for deferred execution or multiple runs
with different endowments or modules.
Calling `loadLocation` returns an `Application` object with an
`execute(endowments?, modules?)` method.

Use `writeArchive` to capture an application in an archival format.
Archives are `zip` files with a `compartmap.json` manifest file.

```js
import fs from "fs";
import { writeArchive } from "endo";

const read = async location =>
  fs.promises.readFile(new URL(location).pathname);
const write = async (location, content) =>
  fs.promises.writeFile(new URL(location).pathname, content);

await writeArchive(
  write,
  read,
  new URL('app.agar', import.meta.url).toString(), // the archive to write
  new URL('app.js', import.meta.url).toString() // the application to capture
);
```

The `writeArchive` function uses `makeArchive`.
Using `makeArchive` directly gives you the archive bytes.

Use `importArchive` to run an application from an archive.
Note the similarity to `importLocation`.

```js
import fs from "fs";
import { importArchive } from "endo";

// ...

const modules = { fs };
const endowments = { console };

const read = async location =>
  fs.promises.readFile(new URL(location).pathname);

const { namespace } = await importArchive(
  read,
  archiveLocation,
  endowments,
  modules
);
```

The `importArchive` function composes `loadArchive` and `parseArchive`.
Use `loadArchive` to defer execution or run multiple times with varying
endowments.
Use `parseArchive` to construct a runner from the bytes of an archive.
The `loadArchive` and `parseArchive` functions return an `Application`
object with an `execute(endowments?, modules?)` method.


## Ruminations on the Name

* In Latin, "endo-" means "internal" or "within".
  This is fitting because Endo runs Node _within_ a safe sandbox.
  This is fitting in turn because Endo is built on the legacy of Google Caja.
  In Spanish, "caja" means "box" and is related to the Latin word "capsum" and
  English "capsule", as in "encapsulate".
* Endo is an anagram of Node and Deno.
  That is to say, we are not Done yet.
* The `endo` command, like the `sudo` command, is a "do" command.
  However, instead of escalating priviliedge, it encapsulates priviledge.
* Endo lets applications endow packages with limited powerful objects and
  modules.  As they say, you can't spell "endow" without "endo"!
* So, "E.N.Do" forms the acronym "Encapsulated Node Do".

So, just as "soo-doo" (super user do) and "soo-doh" (like "pseudo") are valid
pronunciations of `sudo`, "en-doh" and "en-doo" are both valid pronunciations of
`endo`.


## Package Descriptors

Endo uses [Compartments] from the [SES] shim, one for each Node.js package
your application needs.
Endo generates a compartment graph from Node.js packaged module descriptors:
the `package.json` files of the application and all its dependencies.
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
Like Node.js, Endo trusts the package manager to arrange the packages such that
a satisfactory version of every package's dependencies rests in a parent
directory, under `node_modules`.

The `main`, `browser`, and `exports` properties determine the modules each
package exports to other compartments.

The `exports` property describes [package entry points] and can be influenced
by build _tags_.
Currently, the only tag supported by Endo is `import`, which indicates that the
module map should use ESM modules over CommonJS modules or other variants.

> TODO
>
> A future version may reveal other tags like `browser` to prepare an
> application for use in a web client.
> For this case, Endo would prepare a JSON manifest like an `importmap` (if not
> precisely an `importmap`).
> The "compartment map" would be consistent except when the dependency graph
> changes so updates could be automated with a `postinstall` script.
> Preparing a web application for production would follow a process similar to
> creating an archive, but with the `browser` build tag.

The `browser` and `require` tags are well-known but not yet supported.
The `browser` tag will apply for compartment maps generated for use on the web.
The `require` tag is a fallback for environments that do not support ESM and
will never apply.

If no `exports` apply to the root of the compartment namespace (`"."`),
the `main` property serves as a default.

> TODO
>
> The absence of `exports` implies that _all_ of the modules in the package are
> valid entries.
> Endo does not yet support packages that do not name all of their in
> `package.json`, which is unfortunately a significant portion of packages in
> `npm`.

The `files` property indicates all of the files in the package that
should be vended out to applications.
The file set implicitly includes all `**.js`, `**.mjs`, and `**.cjs` files.
The file set implicitly excludes anything under `node_modules`.

> TODO
>
> In Node.js, a module specifier that corresponds to a directory implicitly
> redirects to the underlying `index.js` file.
> Capturing a full list of `files` in a browser compartment map would allow
> a compartment to follow these redirects without chancing a wasted round trip
> to get a File not Found error.
> This could alternately be solved by inferring the redirect when an internal
> module specifier has no extension.

> TODO
>
> Endo does not yet do anything with the `files` globs but a future version
> of Endo will collect these in archives.
> Endo should eventually provide the means for any compartment to access its
> own files using an attenuated `fs` module or `fetch` global, in conjunction
> with usable values for `import.meta.url` in ECMAScript modules or `__dirname`
> and `__filename` in CommonJS modules.

Officially beginning with Node.js 14, Node.js treats `.mjs` files as ECMAScript
modules and `.cjs` files as CommonJS modules.
The `.js` extension indicates a CommonJS module by default, to maintain
backward compatibility.
However, packages that have a `type` property that explicitly says `module`
will treat a `.js` file as an ECMAScript module.


Many Node.js applications using CommonJS modules expect to be able to `require`
a JSON file like `package.json`.
Endo supports loading JSON modules from any type of module.
As of Node.js 14, Node does not support importing JSON using ECMAScript
`import` directives, so using this feature may limit compatibility with the
Node.js platform.

Endo supports loading CommonJS modules from ECMAScript modules as well as
ECMAScript modules importing CommonJS modules.
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
> Endo does not yet respect the `module` field as it currently
> only recognizes ECMAScript modules.
> For backard compatibility, be sure to indicate that any package is of `type`
> `module` if it uses the `.js` extension for ECMAScript modules.
>
> A future version of Endo will support CommonJS modules and enforce this
> behavior.

> TODO
>
> Endo may elect to respect some properties specified for import maps.

> TODO
>
> A future version of Endo may add support for source-to-source
> translation in the scope of a package or compartment.
> This would be expressed in `package.json` using a property like
> `translate` that would contain a map from file extension
> to a module that exports a suitable translator.
>
> For browser applications, Endo would use the translator modules
> in two modes.
> During development, Endo would be able to load the translator
> in the client, with the `browser` tag.
> Endo would also be able to run the translator in a separate
> non-browser compartment during bundling, so the translator
> can be excluded from the production application and archived applications.

> TODO
>
> Endo may also add support for compartment map plugins that would recognize
> packages in `devDependencies` that need to introduce globals.
> For example, _packages_ that use JSX and a virtual DOM would be able to add a
> module-to-module translator and endow the compartment with the `h` the
> translated modules need.

  [Compartments]: https://github.com/Agoric/SES-shim/blob/master/packages/ses/README.md#compartment
  [SES]: https://github.com/Agoric/SES-shim/blob/master/packages/ses/README.md
  [LavaMoat]: https://github.com/LavaMoat/lavamoat
  [package entry points]: https://nodejs.org/api/esm.html#esm_package_entry_points
