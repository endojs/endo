// @ts-check
/**
 * SES polyfill for dev-repl usage outside the Endo daemon.
 *
 * In the real daemon, `@endo/init` runs SES lockdown which provides
 * `harden`, `assert`, and `HandledPromise` as globals.  For the
 * lightweight dev-repl we run lockdown ourselves with permissive
 * settings so that Node.js internals are not frozen.
 */
import 'ses';
import '@endo/eventual-send/shim.js';

if (typeof globalThis.lockdown === 'function' && typeof globalThis.harden === 'undefined') {
  globalThis.lockdown({
    errorTaming: 'unsafe',
    overrideTaming: 'severe',
    consoleTaming: 'unsafe',
  });
}
