# Work on @endo/genie tools

Working on `packages/genie/src/tools/memory.js`:

- [x] refactor to use the new `packages/genie/src/tools/vfs.js`
  - as also used by `packages/genie/src/tools/filesystem.js`
  - the memory module should no longer (directly) import node `fs`

  - [x] vfs instance should be passed to `makeMemoryTools`
  - [x] these module level utilities will need to move within the memory tool makers to use the passed `vfs` instead of the node ambient `fs`
    - `searchInFile`
    - `searchInFiles`
    - `findMemoryPaths`
