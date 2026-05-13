# Notes on `turbo.json`

JSON has no comment syntax, so explanatory notes about the task graph
live here.

## `test` uses `^build` for transitive upstream builds

The `test` task declares `dependsOn: ["build", "^build"]`: a package's
own `build` script runs before its `test` script, **and** every
upstream workspace dependency's `build` runs before that as well.
The `build` task itself declares `dependsOn: ["^build"]` so the
upstream cascade is consistent across the graph.
This is the strong correctness invariant: a package's tests cannot run
until every package it depends on (transitively) has been built.

### Why `^build` is now safe to express

The workspace dependency graph previously contained cycles via
`devDependencies`, in particular through `ses`, `@endo/promise-kit`,
and `@endo/eventual-send`.
Turbo's package graph traverses both `dependencies` and
`devDependencies` and provides no option to restrict it to one or the
other.
Before
[the cycle-breaking design (#206)](./designs/break-dev-dependency-cycles.md)
those edges made `^build` ill-defined and fatal under turbo's cycle
check.

The design factors the dev-only test surfaces into synthetic
`@endo/<pkg>-test` sibling packages so the cycle-forming
`devDependencies` edges fall out of the workspace graph entirely.
Once every cut in the design has landed, `^build` is safe to use and
the in-package-only form is no longer the conservative default.

### Why `lint` is left on the in-package form

The `lint` task keeps `dependsOn: ["build"]` because lint runs in
isolation per package and does not consume artifacts from upstream
package builds.
The build cascade still reaches lint transitively (lint depends on
build, build depends on `^build`), so any upstream change that
invalidates a downstream build also invalidates that downstream's
lint cache; pinning `^build` directly on `lint` would only widen the
hash without changing the schedule.

### Cache invalidation

With `dependsOn: ["build", "^build"]` on `test`, a package's `test`
hash includes the upstream package's `build` hash.
A change strictly inside an upstream package's *source* (without
changing its public surface) now correctly invalidates the downstream
package's `test` cache, which matters for turbo's remote cache when
that lands.
