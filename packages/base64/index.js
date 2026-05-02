// Re-exports the package's named bindings.  Each source module
// (`./src/encode.js`, `./src/decode.js`, `./atob.js`, `./btoa.js`)
// applies `Object.freeze` to its export at module-evaluation time, so
// the bindings are hardened on both the public path through this
// module and on the pre-lockdown shim path that `@endo/init/pre.js`
// uses (`@endo/base64/shim.js` -> `./atob.js` / `./btoa.js`).  Using
// `Object.freeze` rather than `@endo/harden` keeps the shim path free
// of any module that would install a fallback `harden` before SES
// `lockdown()` freezes the well-known properties of `globalThis`.

export { encodeBase64 } from './src/encode.js';
export { decodeBase64 } from './src/decode.js';
export { btoa } from './btoa.js';
export { atob } from './atob.js';
