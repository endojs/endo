# package.json

This is an explainer for the module system configuration of the SES shim
package through some properties of `package.json`.

## "type": "module",

For Node.js, this means that any `.js` file will be interpreted as if it were
`.mjs`, meaning a JavaScript module / ESM, as opposed to `.cjs` which is
explicitly CommonJS.

Notably, the `node -r esm` emulation does not recognize this distinction
and translates all `.js` files down from ESM to CommonJS.
A patch to `esm` that is in the Agoric SDK repository allows `.js`
files in dependencies to break through to the underlying Node.js ESM.

## "main": "./dist/ses.cjs",

SES provides its own translation from its own ESM sources to CommonJS, emitted
by `yarn build`, specifically `scripts/bundle.js`.
This is spiritually similar to Rollup because it produces a CommonJS module
from an JavaScript module and its transitive imports, but uses a translation
that was designed to preserve the security properties of SES and participate
fully in SES audits.

The `main` property has been supported by the npm ecosystem since the
earliest versions, so every version of Node.js and every tool will look
here if nothing else in `package.json` overrides it.

## "module": "./index.js",

Some tools like Parcel and the ESM emulation provided by `node -r esm`
use this instead of `main` if it is present.
This is a dead-end design that Node.js did not adopt when it implemented
JavaScript modules, but is necssary for these older tools to
indicate that the `index.js` source is ESM.
Otherwise, they would use `main` which is not a valid ESM.

## "types": "./index.d.ts",

TypeScript uses this to transport type definitions.
These include type declarations (which are scoped like module exports)
an also definitions of global variables.
A pragma can be used in any JavaScript file to import the global type
definitions from SES into environments that assume SES has been initialized and
do not directly import the shim.

```
/// <reference types="ses"/>
```

## "unpkg": "./dist/ses.umd.js",

The [Unpkg][] CDN uses this property to direct usage of SES to a precompiled
module in "Universal Module Definition" format.
Because the SES shim bundle has no dependencies and uses `globalThis` to
vend out its API instead of using any particular module system,
a single SES bundle serves as a CommonJS module and a suitable source fo
a `<script>` tag.

[Unpkg]: https://unpkg.com/

## "exports": {

Node.js introduced `imports` and `exports` properties to `package.json`
when it added support for JavaScript modules.
Any package that provides `exports` can *enforce* which modules inside its
package are externally visible, can create aliases, and can declare predicates
for which alias to use depending on the environment, like `import` for systems
supporting JavaScript modules, `require` for CommonJS, `browser` for scripts.

## ".": "./dist/ses.cjs",

SES provides a compiled bundle that is suitable in any module system.

## "./lockdown": "./dist/ses.cjs",

The most recent SES only provides one API, but a previous version
exported a separate `ses/lockdown` layer.
For ease of migration, we provide this alias, but the distinction
is deprecated.

## "./package.json": "./package.json"

Tools like Svelte need to access the `package.json` of every package in an
application.
Node.js versions with JavaScript module support require this "module" to be
made expressly public.
