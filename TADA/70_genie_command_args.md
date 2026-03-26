# @endo/genie command tool

Work on `packages/genie/src/tools/command.js`:
- [x] normalize the two modes of `makeCommandTool`
  - just have `args: string[]`, no need to call it `command` in the "no `program` given" side
  - i.e. "program" is just the first argument
  - ... and arugments always should have been an array-of-string, not just a string
