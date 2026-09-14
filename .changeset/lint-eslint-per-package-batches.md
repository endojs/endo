---
---

chore: lint in bounded package buckets to stay under the typescript-eslint
project-service scaling ceiling.

`yarn lint:eslint` no longer runs a single `eslint .` over the whole
repository. A single run builds one typescript-eslint project service that
must hold every package's TypeScript program at once, and past a scale this
monorepo crosses on large pull requests that service stopped resolving the
alphabetically-last packages (`packages/where`, `packages/zip`), reporting
every file in them as `none of those TSConfigs include this file` even though
each package's `tsconfig.json` includes those files (they lint clean when a
package is linted on its own). `yarn lint:eslint` now delegates to
`scripts/eslint-repo.mjs`, which lints packages in bounded buckets
(`ESLINT_BUCKET_SIZE`, default 10 packages per process) plus one batch for the
repository-root files, so each project service holds only a bucket's worth of
programs -- far under the whole-repo count that drops its tail -- while a
handful of processes rather than one per package amortize ESLint startup and
share loaded dependency types across a bucket. Coverage and rules are
unchanged; only the grouping into processes differs.
