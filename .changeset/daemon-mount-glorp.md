---
'@endo/daemon': minor
---

Add `glorp(glob, grep, options?)` to `EndoMount`: the fused glob+grep search
extension.

`glorp(glob, grep, options?) -> Promise<Array<{ file, line, text }>>` enumerates
the files matching the `glob` pattern and searches each for the `grep` pattern,
returning the same `{ file, line, text }` records as `grep`. Both patterns are
**required positionals** (unlike `grep`'s optional `paths`), so the whole
operation is expressible as a single call whose two patterns a native filesystem
layer can push down and fuse into one enumerate-and-scan pass — no glob result
set round-trips back through JS.

The reference implementation composes the decoupled surface directly:
`glorp(g, p)` is the fused equivalent of `grep(p, glob(g))`, so it inherits the
same confinement, deny-pattern filtering, CRLF normalization, and `maxResults`
cap (default 1000). A Rust/XS platform may override `glorp` behind the same seam
with a native fused call. This is the fused counterpart to the glob/grep
decoupling — prefer `glorp` when both patterns are known up front and prefer the
explicit `grep(pattern, glob(g))` composition when glob output is reused.
