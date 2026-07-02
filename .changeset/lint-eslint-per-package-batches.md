---
---

chore: lint per package to stay under the typescript-eslint project-service
scaling ceiling.

`yarn lint:eslint` no longer runs a single `eslint .` over the whole
repository. A single run builds one typescript-eslint project service that
must hold every package's TypeScript program at once, and past a scale this
monorepo crosses on large pull requests that service stopped resolving the
alphabetically-last packages (`packages/where`, `packages/zip`), reporting
every file in them as `none of those TSConfigs include this file` even though
each package's `tsconfig.json` includes those files (they lint clean when a
package is linted on its own). `yarn lint:eslint` now delegates to
`scripts/eslint-repo.sh`, which lints one package per process plus one batch
for the repository-root files, so each project service stays small and no
package is dropped regardless of repository size. Coverage and rules are
unchanged; only the invocation is batched.
