---
'@endo/compartment-mapper': minor
---

Add support for Node.js subpath pattern replacement in `package.json` `exports` and `imports` fields. Patterns like `"./features/*.js": "./src/features/*.js"` and `"#internal/*.js": "./lib/*.js"` are now resolved at link time using prefix/suffix string matching with specificity ordering. Null-target patterns exclude matching specifiers. Conditional pattern values are resolved through the standard condition-matching rules. Patterns are expanded to concrete module entries during archiving.
