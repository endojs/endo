---
'@endo/module-source': minor
'@endo/evasive-transform': minor
'@endo/parser-pipeline': minor
---

Upgraded the Babel dependencies from 7.x to 8.x, which makes these packages
usable in a browser bundle without a `process` shim.

`@babel/types` 7.x reads `process.env.BABEL_TYPES_8_BREAKING` at module scope,
33 times across four files, while building its AST node definition tables. In a
bundle for a runtime with no `process` global, importing any of these packages
therefore threw `ReferenceError: process is not defined` before a single line of
user code ran. Consumers have had to work around it by assigning
`globalThis.process = { env: {} }` before the import, a global mutation that
also makes `typeof process` checks in the rest of the bundle report a Node
environment. Babel 8 makes those semantics the default and removes the flag, so
no `@babel/*` package reads `process` unguarded any more.

Two consequences for consumers:

- **Babel 8 requires Node `^22.18.0 || >=24.11.0`.** That is now the effective
  floor for these three packages.
- **Dynamic `import()` is a different AST node.** Babel 8 parses it as
  `ImportExpression` rather than a `CallExpression` with an `Import` callee.
  Anyone supplying custom visitors to `@endo/parser-pipeline` that match on the
  old shape must add an `ImportExpression` visitor.

Source maps produced by `@babel/generator` 8 no longer populate the optional
`names` field. Generated code is unchanged.
