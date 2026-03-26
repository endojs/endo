# Work on @endo/genie tools

Work on `packages/genie/src/tools/filesystem.js`:

The following directory-oriented tools should be added to this module
to provide structured filesystem access without requiring full bash:

1. [x] add `listDirectory({ path, recursive?, glob? })` to `makeFileTools`
  - List files and subdirectories under `path`.
  - Optional `recursive` flag for deep listing.
  - Optional `glob` pattern filter (e.g., "*.js").
  - Returns: { success, path, entries: Array<{ name, type, size }> }
  - Enforces root traversal limit via safePath().

2. [x] add `makeDirectory({ path, recursive? })` to `makeFileTools`
  - Create a directory (and parents if `recursive` is true).
  - Returns: { success, path, created }
  - Enforces root traversal limit via safePath().

3. [x] add `removeDirectory({ path, recursive? })` to `makeFileTools`
  - Remove an empty directory, or recursively if `recursive` is true.
  - Returns: { success, path }
  - Enforces root traversal limit via safePath().
  - Should refuse to remove the root itself.

All tools should use `makeTool` pattern from `packages/genie/src/tools/common.js`.
