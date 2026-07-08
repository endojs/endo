---
'@endo/agent-tools': minor
---

Add `makeGitMountTools(gitCap)`, the mount-bridged half of the git tool surface
(daemon-agent-tools Phase 3). It exposes `status` and `add` — the two `EndoGit`
methods whose native signatures traffic in live mount-entry capabilities — as
JSON-transparent tool records that complement `makeGitTool`'s one-to-one
guard-mapped slice. `status` projects each working-tree row to a JSON-safe
`{ path, index, worktree, renamedFrom? }`, stripping the authority-bearing
`entry`/`node` remotables so none crosses the tool wire; `add` takes
mount-relative path strings, resolves each through the worktree mount to the
`EndoMountEntry` that `Git.add` consumes, and stages additively (a `..` segment
is contained by the mount, clamped at the worktree root; a path addressing only
the root is rejected). Also adds the `./git-mount-tool.js` subpath export and
the `GitMountToolCapability` type.
