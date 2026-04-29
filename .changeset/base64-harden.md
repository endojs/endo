---
'@endo/base64': minor
'@endo/bundle-source': patch
---

`@endo/base64`'s named exports (`encodeBase64`, `decodeBase64`, `atob`, `btoa`)
are now frozen.
Consumers that previously assigned to or extended these exports will see a
`TypeError` under SES; read-only consumers are unaffected.

The shim entry point `@endo/base64/shim.js` (which `@endo/init/pre.js` uses to
install `globalThis.atob` / `globalThis.btoa` before `lockdown()`) is unchanged
and continues to be safe to load pre-lockdown.
