- [x] stop using `await import`
  - [x] as noticed in `packages/genie/src/heartbeat/index.js`, just
    hoist the needed imports to module level
  - [x] review other `packages/genie/` code and create follow-up
    `TODO/` tasks → created `TODO/46_genie_code_quality.md`
  - no dynamic imports remain in `packages/genie/src/`
  - also fixed: removed unused `open()` file handle in `hasContent()`
    and removed invalid `fileHandle.seek()` call in `getLastLine()`
