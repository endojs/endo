# Work on @endo/genie tools

Work on `packages/genie/src/tools/filesystem.js`:

1. [x] implement all inline `TODO` comments from code review
   - Hoisted `fs/promises` import to module level (was dynamic in 3 places)
   - Added default export for `makeFileTools`
   - Fixed `for...in` → `for...of` bug in `common.js` default `desc`
   - Added `harden()` to `makeTool` return value and added `harden(makeTool)` export call

2. expand documentation within `packages/genie/src/tools/common.js`:
  - [x] generalize the maker function returns a set of named `Tool`s using `makeTool`
  - [x] exemplified by `filesystem.js` module
  - [x] convention around `help` line generator function
  - [x] how the first line should be a simple description, do not repeat the tool name in it
