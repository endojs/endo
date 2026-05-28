// @ts-check
/**
 * Interface guards for the tree-shape adapter this package exposes.
 *
 * `TreeView` and `TreeBlob` together match the small slice of the
 * `ReadableTree` / `Mount` surface that `@endo/daemon`'s
 * `make-from-tree` formula consumes — see
 * `packages/daemon/src/worker.js` `makeFromTree` and the daemon's
 * `packTreeIntoArchiveBytes` helper.
 */

import { M } from '@endo/patterns';

/**
 * Tree-blob shape: a blob with a single `text()` method returning
 * the file's contents as a UTF-8 string.
 */
export const TreeBlobInterface = M.interface('TreeBlob', {
  text: M.call().returns(M.promise()),
  help: M.call().optional(M.string()).returns(M.string()),
});
harden(TreeBlobInterface);

/**
 * Tree-view shape: `lookup(name)` maps a `string` (single segment)
 * or `string[]` (segments) to a `TreeBlob`. The return is a
 * synchronously-minted local exo (`M.remotable`, not `M.eref`) —
 * the walk over the underlying filesystem is deferred to
 * `TreeBlob.text()`.
 */
export const TreeViewInterface = M.interface('TreeView', {
  lookup: M.call(M.or(M.string(), M.arrayOf(M.string()))).returns(
    M.remotable('TreeBlob'),
  ),
  help: M.call().optional(M.string()).returns(M.string()),
});
harden(TreeViewInterface);
