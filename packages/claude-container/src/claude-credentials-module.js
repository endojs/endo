// @ts-check
/* global process */
//
// Per-credential ClaudeCredentials caplet. The credentials factory
// in `claude-credentials-factory.js` calls `host.makeUnconfined`
// on this module to mint a formulated cap under the chosen pet
// name in @host's petstore. Same shape as the per-session
// ClaudeClient / fs-bridge caplets.
//
// Expected env:
//   API_KEY        Anthropic API key to bundle.
//
// The resulting cap exposes the ClaudeCredentials surface
// documented in `claude-credentials-factory.js`. Reincarnating the
// formula after a daemon restart re-issues the same key from the
// env.

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeError, X, q } from '@endo/errors';

const CredentialsInterface = M.interface('ClaudeCredentials', {
  issue: M.call(M.string()).returns(M.promise()),
  revoke: M.call(M.string()).returns(M.promise()),
  rotate: M.call(M.string()).returns(M.promise()),
  help: M.call().optional(M.string()).returns(M.string()),
});

/**
 * @param {unknown} _powers
 * @param {unknown} _context
 * @param {object} [contextWrapper]
 * @returns {object}
 */
export const make = (_powers, _context, contextWrapper = {}) => {
  const env = /** @type {any} */ (contextWrapper).env ?? process.env;
  let apiKey = env.API_KEY;
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw makeError(X`claude-credentials-module: API_KEY required`);
  }
  return makeExo('ClaudeCredentials', CredentialsInterface, {
    async issue(_sessionId) {
      return harden({ apiKey });
    },
    async revoke(_sessionId) {
      // v1: no per-session state.
    },
    async rotate(newApiKey) {
      if (typeof newApiKey !== 'string' || newApiKey.length === 0) {
        throw makeError(X`EINVAL: rotate requires a non-empty string`);
      }
      apiKey = newApiKey;
    },
    help(method) {
      if (method === undefined) {
        return [
          'ClaudeCredentials.',
          '',
          '  issue(sessionId) → { apiKey }',
          '  revoke(sessionId) → ()',
          '  rotate(newApiKey) → ()',
        ].join('\n');
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
};
harden(make);
