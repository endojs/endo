---
"@endo/evasive-transform": minor
---

- Add meaning-preserving transformation of expressions and literals containing content that would otherwise be rejected by SES for looking like dynamic import or HTML-like comments. Previously only comments were transformed. Use `onlyComments` option to opt-out of the new behavior.
