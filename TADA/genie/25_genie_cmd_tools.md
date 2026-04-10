# Work on @endo/genie tools

Work on `packages/genie/src/tools/command.js`:

1. [x] refactor to use `makeTool` from `packages/genie/src/tools/common.js`

2. [x] drop the git fixture, leave that up to consuming module, but keep it as an example documentation comment

3. [x] rework the `rejectPatterns` and `rejectFlags` utilities so that each of their rejected items may also specify a reason
  - for example we want to be able to write patterns like:
    ```javascript
    {
        pattern: /rm\s+-rf\s+[^*]$/,
        reason: 'use the removeDirectory tool instead',
    }
    ```
    to help guide agents into correct tool call patterns
