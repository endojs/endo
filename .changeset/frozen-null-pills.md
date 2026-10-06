---
'ses': patch
---

`lockdown()` now tolerates an undeletable `arguments` or `caller` property on an API function when it is a frozen `null` (non-writable, non-configurable), with a warning, as it already tolerates an undeletable `prototype` that can be set to `undefined`. Chromium's V8 through at least 133, as shipped in the Android System WebView, puts such poison pills on every Web IDL function, and lockdown previously failed there. Any other value, or a writable or configurable pill, still fails lockdown.
