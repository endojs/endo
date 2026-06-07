---
'@endo/eslint-plugin': minor
---

The `internal` preset now enforces `unicorn/numeric-separators-style` with
default groupings: decimal numbers of five or more digits must use underscore
separators every three digits, and hexadecimal, binary, and octal literals must
use the rule's conventional group lengths.
Consumers of `plugin:@endo/internal` will see lint errors on numeric literals
that violate the rule; `eslint --fix` rewrites them automatically.
Sites extending the preset must add `eslint-plugin-unicorn` to their devDeps.
