// @ts-check
// Minimal harden polyfill for testing outside SES.
// Uses identity function — real hardening requires SES lockdown.
if (typeof globalThis.harden === 'undefined') {
  /** @type {any} */
  globalThis.harden = x => x;
}
