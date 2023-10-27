# package.json

This is an explainer for the module system configuration of the SES shim
package through some properties of `package.json`.

## "type": "module"

For Node.js, this means that any `.js` file will be interpreted as if it were
`.mjs`, meaning a JavaScript module / ESM, as opposed to `.cjs` which is
explicitly CommonJS.

Notably, the `node -r esm` emulation does not recognize this distinction
and translates all `.js` files down from ESM to CommonJS.
A patch to `esm` that is in the Agoric SDK repository allows `.js`
files in dependencies to break through to the underlying Node.js ESM.

## "main": "./dist/ses.cjs"

SES provides its own translation from its own ESM sources to CommonJS, emitted
by `yarn build`, specifically `scripts/bundle.js`.
This is spiritually similar to Rollup because it produces a CommonJS module
from an JavaScript module and its transitive imports, but uses a translation
that was designed to preserve the security properties of SES and participate
fully in SES audits.

The build step generates a file that does not use any module system.
It provides its API by altering the intrinsics and adding functions to
`globalThis`. It has no dependencies and consists entirely of sources from the
`ses` package. So, a single file is suitable for use as a script, a CommonJS
module, or an ESM (JavaScript module). However, some tools are sensitive
to the file extension, so it copies the same content to `dist/ses.umd.js` and
`dist/ses.cjs`.

The `main` property has been supported by the npm ecosystem since the
earliest versions, so every version of Node.js and every tool will look
here if nothing else in `package.json` overrides it.

## "module": "./index.js"

Some tools like WebPack, Parcel and the ESM emulation provided by `node -r esm`
use this instead of `main` if it is present.
This is a dead-end design that Node.js did not adopt when it implemented
JavaScript modules, but is necssary for these older tools to
indicate that the `index.js` source is ESM.
Otherwise, they would use `main` which is not a valid ESM.

This could have been `./dist/ses.umd.js`, but the generated file contains
non-ASCII characters (we use zero-width-joiner to avoid collisions with other
names in scope, then censor the use of zero-width-joiner in source).
Most tools tolerate this, but WebPack does not.

## "unpkg": "./dist/ses.umd.js"

The [Unpkg][] CDN uses this property to direct usage of SES to a precompiled
module in "Universal Module Definition" format.
Because the SES shim bundle has no dependencies and uses `globalThis` to
vend out its API instead of using any particular module system,
a single SES bundle serves as a CommonJS module and a suitable source for
a `<script>` tag.

[Unpkg]: https://unpkg.com/

## "types": "./types.d.ts"

TypeScript uses this to transport type definitions.
These include type declarations (which are scoped like module exports)
an also definitions of global variables.
A pragma can be used in any JavaScript file to import the global type
definitions from SES into environments that assume SES has been initialized and
do not directly import the shim.

```js
/// <reference types="ses"/>
```

## "exports": {

Node.js introduced `imports` and `exports` properties to `package.json`
when it added support for JavaScript modules.
Any package that provides `exports` can *enforce* which modules inside its
package are externally visible, can create aliases, and can declare predicates
for which alias to use depending on the environment, like `import` for systems
supporting JavaScript modules, `require` for CommonJS, `browser` for scripts.

## ".": {

This could have been a single value and had any extension to support every
usage pattern through versions of Node.js. Before supporting `exports`, Node.js
would simply have used `main`. And, `node -r esm` just uses `module`.  After
supporting `exports`, ignores the extension, relying on the `import` or
`require` to redirect if necessary for the importers's needs.

However, `@web/dev-server` gets confused by the extension.

The variations differ only in file name extension.

## "import": "./index.js"

Node.js and other tools will use this file when importing `ses` as an ESM.
(JavaScript module).
We have in the past experimented with using the precompiled bundle of SES here
(`./dist/ses.cjs` or `./dist/ses.umd.js`), but found that this interacted
poorly with Endo, because an Endo bundle contains identifiers that SES censors.

## "require": "./dist/ses.cjs"

Node.js and other tools will use this file when importing `ses` as an CommonJS module.

## "types": "./types.d.ts"

Only applicable for TypeScript v4.7+ consumers configured with `node16` or
`nodenext` [module resolution][]. This serves the same purpose as the `types`
prop at the top level.

## "./lockdown"

The most recent SES only provides one API, but a previous version
exported a separate `ses/lockdown` layer.
For ease of migration, we provide this alias, but the distinction
is deprecated.

The value is the same as for `"."` above.

## "./tools.js"

Exposes tools that are useful for creating hardened JavaScript environments that move certain responsibilities from `eval` to generated code.

## "./package.json": "./package.json"

Tools like Svelte need to access the `package.json` of every package in an
application.
Node.js versions with JavaScript module support require this "module" to be
made expressly public.

[module resolution]: https://www.typescriptlang.org/docs/handbook/modules/theory.html#module-resolution
