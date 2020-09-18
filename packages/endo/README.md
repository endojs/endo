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

# Design

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
> For development, Endo would provide a compartment mapper tool that would
> build a `compartment-map.json` each time the dependency graph changes or when
> endowment policies change.
> To run an Endo application on the web, the developer would introduce
> a `<script src="node_modules/endo/web.js" data-import="./app.js"
> data-compartment-map="compartmetn-map.json">`.
> The `data-import` and `data-compartment-map` might have sensible defaults.
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

> TODO
>
> For browser applications, a future version of Endo will ship a compartment
> mapper command that can be used as a `postinstall` script
> to generate a compartment map applications can use _during development_
> to run on the client side without a build step.
>
> This compartment map will include the `browser` tag and all corresponding
> module aliases from the `exports` field in `package.json`.
> The Endo command line tool will always generate a compartment map
> of its own without the `browser` tag and will never use the
> `compartment-map.json` file on disk.
>
> A compartment map is similar in spirit to an import map or a package lock.
> The object fully describes how to compose a compartment DAG to run an
> application.
> A compartment map is intended to be generated only when dependencies or
> compartment policies change, not to be drafted by hand, and certainly not to be
> both manually and automatically maintained.
>
> As with an importmap, we can add a postinstall hook to package.json that will
> generate a new compartment map each time the dependency graph of an
> application changes.
>
> ```json
> {
>   "scripts": {
>     "postinstall": "endo map index.js > compartment-map.json"
>   }
> }
> ```
>
> We can include this in the scaffolding for compartmentalized applications.
>
> The compartment mapper generates a `compartment-map.json` file by crawling
> `node_modules` and finding all the `package.json` files as an input.
> Then, it merges a policies if it finds them.
> In the absence of authority policies, the compartment mapper grants all
> endowed globals and modules to every compartment.
