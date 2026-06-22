---
'ses': patch
---

The console format specifier `%c` is for consuming a CSS style string and applying that style to the rendering of the remaining arguments. Node.js and browsers both parse `%c` the same way and have it consume one argument.
- Browsers actually make use of the CSS, leading to security problems (e.g., https://issues.chromium.org/40056332 ).
- Node.js ignores the `%c` and its corresponding argument, which is allowed by the [WHATWG Console specification](https://console.spec.whatwg.org/).

To avoid the CSS security problems on all platforms, under the defaut `consoleTaming: 'safe'`, we now sanitize out the `%c` and corresponding argument, emulating the allowed current Node.js behavior on all platforms. This fixes this CSS vulnerability while maintaining compatibility with the specification. We also treat unknown specifiers in a future-proof manner.
