---
'@endo/eslint-plugin': patch
---

Declare `@typescript-eslint/*` and `typescript-eslint` as caret ranges
(`^8.39.1`) rather than exact pins, so consumers can dedupe them against
their own typescript-eslint versions instead of being forced onto a
single release. Also drop the redundant `parserOptions.project` from the
internal config: typescript-eslint 8.60 errors when `project` is set
alongside `projectService`, which now supplies the type-aware program.
