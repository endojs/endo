---
'@endo/eslint-plugin': minor
---

Migrate the bundled `@endo/imports` ESLint config off the unmaintained `eslint-plugin-import` and onto the actively-maintained `eslint-plugin-import-x` soft fork.
This is done via a Yarn package alias (`eslint-plugin-import: 'npm:eslint-plugin-import-x@4.16.2'` in the `dev` catalog), so the package on disk is still named `eslint-plugin-import` and ESLint continues to register its rules under the existing `import/*` namespace.
The import-x implementation ships its own `unrs-resolver`, which natively honours the `package.json` `exports` field, so the explicit `import/resolver` settings block is no longer required and has been removed.
Downstream consumers do not need to rename any `import/*` rule references; existing `eslintrc` snippets continue to work.
