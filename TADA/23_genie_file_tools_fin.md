# Work on @endo/genie tools

Work on `packages/genie/src/tools/filesystem.js`:

1. [x] add `removeFile({ path })` to `makeFileTools`
  - Remove a single file.
  - Returns: { success, path }
  - Enforces root traversal limit via safePath().

2. [x] add `stat({ path })` to `makeFileTools`
  - Return metadata about a file or directory (size, type, mtime).
  - Returns: { success, path, type, size, modified }
  - Enforces root traversal limit via safePath().

All tools should use `makeTool` pattern from `packages/genie/src/tools/common.js`.
