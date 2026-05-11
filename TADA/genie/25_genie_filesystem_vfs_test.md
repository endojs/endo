# Work on @endo/genie tools

Work on `packages/genie/src/tools/filesystem.js`:

1. [x] implement an in-memory vfs that can be used for ephemeral scratch space, like a test
  - Created `packages/genie/src/tools/memory-vfs.js` with `makeMemoryVFS()`
  - Implements full VFS interface: stat, readFile, createReadStream, writeFile, mkdir, unlink, rmdir, rm, readdir
  - Exported from `packages/genie/src/tools/index.js`

2. [x] write a unit test for genie's file tools
  - Created `packages/genie/test/tools/filesystem.test.js` (24 tests, all passing)
  - Tests all 8 file tools: readFile, writeFile, editFile, removeFile, stat, listDirectory, makeDirectory, removeDirectory
  - Tests path safety (traversal rejection, null byte rejection)
  - Uses AVA framework with `dev-harden-polyfill.js` for SES compatibility
  - Note: must run with AVA 7 (`node node_modules/.store/ava-virtual-6070099375/package/entrypoints/cli.mjs`)
