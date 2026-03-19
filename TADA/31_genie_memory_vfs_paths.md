# Work on @endo/genie memory tools

Working on `packages/genie/src/tools/memory.js`:
- [x] its VFS abstraction should also handle path join and relativization
  - the memory module itself should not be importing node's `path` module
  - in particular the `packages/genie/src/tools/vfs-node.js` implementation should
    1. [x] take a limiting root at creation
    2. [x] handle all path traversal for its users
    3. [x] prevent traversal escaping said root
  - keep the surface area small: just provide `join(...parts)`, `sep`, `relative(from, to)`, and `resolve(...paths)`
    - users can implement their own `basename` or `dirname` like logic with standard string methods and `sep`

## Changes made

- `vfs.js`: Added `sep`, `join`, `relative`, `resolve` to the `VFS`
  typedef.
- `vfs-node.js`: `makeNodeVFS(rootDir?)` now accepts an optional
  limiting root.  When provided, `resolve()` enforces that the
  result stays under that root.  Path methods delegate to Node's
  `path` module internally.
- `vfs-memory.js`: `makeMemoryVFS(rootDir?)` gains the same path
  utilities using pure POSIX string operations (no Node imports).
  Added `normalizePosix` and `posixRelative` helpers.
- `memory.js`: Removed `import { … } from 'path'`.  All path
  operations now go through `vfs.resolve()`, `vfs.join()`,
  `vfs.relative()`, and `vfs.sep`.  `safePath` delegates to
  `vfs.resolve()` for root enforcement.  `dirname`/`basename`
  replaced with `string.slice` + `vfs.sep`.
  `makeSubstringBackend` no longer takes a `root` parameter —
  it uses `vfs.resolve()` directly.
- Tests updated to pass `root` to `makeMemoryVFS(root)` so the
  VFS resolve operates against the correct root.
