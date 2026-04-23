---
"@endo/evasive-transform": minor
---

- Add `customVisitor` option - a visitor function to be called on each node of the Babel traverse, in addition to the standard transforms in evasive-transform. Receives the same path argument as a normal Babel visitor.
- Add an easion for a class or object method being named `import` or `eval`
