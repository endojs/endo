# Work on @endo/genie tools

Okay so working on `packages/genie/src/tools/`:

- [x] all of the execute param records should actually be `splitRecord`s not `recordOf` with `M.opt(...)` fields
  - Only `read-file.js` needed fixing; all other tools already used `M.splitRecord`.
  - *BAD*:
    ```javascript
    execute: M.call(M.recordOf(M.string(), {
      path: M.string(),
      offset: M.opt(M.number()),
      limit: M.opt(M.number()),
    })).returns(
    ```
  - *GOOD*:
    ```javascript
    execute: M.call(M.splitRecord(
        { path: M.string() },
        {
          offset: M.number(),
          limit: M.number(),
        }
    )).returns(
    ```
