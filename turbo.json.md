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
Turbo's task-graph builder rejects task graphs with cycles, so
`dependsOn: ["^build"]` (build all upstream workspace deps first)
fails the cycle check.

The in-package form `dependsOn: ["build"]` skips the upstream traversal
and so does not trip the detector.
For most packages this is harmless because their `build` script is
`exit 0`; the few packages whose `build` produces artifacts consumed by
runtime code (e.g. `ses`) are already built in topological order by
the wrapping `yarn build` step that the CI workflow runs before
`yarn turbo run test`.

A future cleanup that breaks the dev-dependency cycle could re-enable
`^build` for stronger correctness (test would then re-run when an
upstream package changed even if the local package did not).
Until then, do not "fix" the in-package form back to `^build`; it will
fail.
