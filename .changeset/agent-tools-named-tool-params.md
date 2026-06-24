---
'@endo/agent-tools': minor
---

Name each git tool's parameters from its method instead of the generic `arg0`/`arg1` convention. `gitToolSchemas` now declares real, declarative property names that read as an LLM-facing signature (`commit` → `message`, `show` → `ref`, `createBranch` → `name`/`options`, `switchBranch` → `branch`, `log`/`diff` → `options`), and `makeTool` marshals the named-args record into positionals by each schema's declared `parameters.properties` order and `required` set rather than the hardcoded `argN` keys. Arity, required-key validation, and the schema-to-guard parity are preserved.
