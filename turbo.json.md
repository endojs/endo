# Notes on `turbo.json`

JSON has no comment syntax, so explanatory notes about the task graph
live here.

## `test` uses `^build` for transitive upstream builds

The `build` task declares `dependsOn: ["^build"]`: a package's own
`build` runs only after every upstream workspace dependency's `build`.
The `test` task declares `dependsOn: ["build", "^build"]`: a package's
own `build` runs before its `test`.
The transitive cascade across the workspace is carried by `build`'s
`^build` edge; turbo's resolver walks it whether or not `test`
spells `^build` out explicitly.
The redundant `^build` on `test` is kept for legibility (so a reader
of `turbo.json` does not need to re-derive the cascade from `build`'s
edge) and to make `test`'s own task hash include each upstream
`build`'s hash directly.
This is the strong correctness invariant: a package's tests cannot run
until every package it depends on (transitively) has been built.

### Why `^build` is now safe to express

The workspace dependency graph previously contained cycles via
`devDependencies`, in particular through `ses`, `@endo/promise-kit`,
and `@endo/eventual-send`.
Turbo's package graph traverses both `dependencies` and
`devDependencies` and provides no option to restrict it to one or the
other.

Turbo 2.9 reports a workspace-graph cycle as a non-fatal warning
(`Circular package dependency detected: ...`) and the run proceeds.
What is fatal is the *task-graph* cycle that `^build` then induces:
once `build` depends on `^build`, the package-graph cycle becomes a
cycle in the `build` task's dependency graph, and turbo refuses to
compute a task graph with `Cyclic dependency detected` (non-zero
exit).
That is the gate this PR sits behind:
[the cycle-breaking design (#206)](./designs/break-dev-dependency-cycles.md)
removes the workspace-graph cycle, after which the task-graph cycle
no longer arises and `^build` resolves cleanly.

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

### CI consumer

The only CI step that runs through turbo is the `test` job in
`.github/workflows/ci.yml` (the
`yarn turbo run test --filter='...[origin/llm]'` invocation).
The `lint` job in the same workflow runs `yarn lint` directly and
does not consult `turbo.json`, so the cascade described here applies
to the affected-set test runs only.

### Cache invalidation

With `dependsOn: ["build", "^build"]` on `test`, a package's `test`
hash includes the upstream package's `build` hash.
A change strictly inside an upstream package's *source* (without
changing its public surface) now correctly invalidates the downstream
package's `test` cache, which matters for turbo's remote cache when
that lands.
