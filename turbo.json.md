# Notes on `turbo.json`

JSON has no comment syntax, so explanatory notes about the task graph
live here.

## `dependsOn: ["build"]` is intentional, `^build` is not used

The `test` and `lint` tasks declare `dependsOn: ["build"]` (the
package's own `build` script must run before its `test` or `lint`
script).
This is deliberately the in-package form, **not** the
upstream-workspace form `^build`.

The reason is that the workspace dependency graph contains cycles via
`devDependencies`, in particular through `ses`, `@endo/promise-kit`,
and `@endo/eventual-send`.
For example, `ses` depends on `@endo/test262-runner` (devDep), which
depends on `ses` (devDep) again; `@endo/promise-kit` and
`@endo/eventual-send` form a similar mutual devDep loop.
These cycles are real in the workspace graph but harmless at runtime
because the relationships are dev-only (test scaffolding, type imports
between sibling test suites).

### Why not `^build`?

`^build` (build all upstream workspace deps first) would let turbo
re-run `test` whenever an upstream package changed even if the local
package did not.
That is the stronger correctness invariant we would prefer.

Two obstacles:

1. **Turbo's package graph traverses both `dependencies` and
   `devDependencies` and provides no configuration option to restrict
   it to one or the other.** The maintainer's instinct ("topologically
   sort by dependencies, ignoring devDependencies") is the right
   shape, but as of turbo 2.9 it is not a supported option. There is
   no `turbo.json` schema entry, no CLI flag, and no documented
   workaround. Related upstream issues (vercel/turborepo #675, #796,
   #9253) have been closed without adding the capability.
2. **Turbo 2.9 demoted the cycle check from a fatal error to a
   warning.** Switching to `^build` no longer fails the run; the
   warning prints once at the start of every invocation listing every
   package in the cycle. The build still proceeds and the task graph
   is computed. The cost is purely cosmetic noise on every CI log.

So `^build` is now functionally available, but it (a) does not achieve
what the maintainer asked for (true dependencies-only traversal) and
(b) trades cleaner CI output for the stronger correctness invariant.

### Why the in-package form is sufficient here

For most packages the in-package `build` script is `exit 0`; the few
packages whose `build` produces artifacts consumed by runtime code
(e.g. `ses`) are already built in topological order by the wrapping
`yarn build` step that the CI workflow runs before
`yarn turbo run test`.

Affected-set selection still works correctly with the in-package
form.
The `--filter='...[origin/llm]'` invocation in `ci.yml` uses the `...`
prefix, which expands to "the matched packages **and all their
transitive dependents**".
That filter walks the same workspace dependency graph turbo would walk
for `^build`, so a change in (e.g.) `ses` still selects every
downstream package's test, even though `dependsOn` is the in-package
form.

The remaining gap is only the per-task hash: with `dependsOn:
["build"]`, a package's `test` hash does not include the upstream
package's `build` hash, so a change strictly inside an upstream
package's *source* (without changing its public surface) would not
invalidate a downstream package's `test` cache.
In practice the wrapping `yarn build` rebuilds all sources on every
CI run, so this is not observable today; it would only matter if we
later wired up turbo's remote cache for incremental cross-PR reuse.

### Future cleanup

Three plausible futures:

1. Break the dev-dependency cycles upstream (factor the test-only
   cross-imports into a smaller helper package that is not itself a
   dev-dependency target).
   Then `^build` works without the cycle warning and the maintainer's
   ideal becomes the actual configuration.
2. Land a turbo PR adding a `dependencyTypes` option to constrain the
   graph traversal.
   Several upstream issues have been closed without this; a fresh PR
   with a concrete patch may land where prior feature requests did
   not.
3. Accept the cosmetic cycle warning and switch to `^build` for the
   stronger correctness invariant.
   This is the smallest local change but produces visible warning
   noise on every CI run, which conflicts with the project's silent-
   by-default diagnostic discipline.

Until one of these lands, the in-package form stays.
Do not "fix" `dependsOn: ["build"]` to `^build` without also
addressing the warning noise.
