// @ts-check
/* global process */
//
// Per-credential ClaudeCredentials caplet. The credentials factory
// in `claude-credentials-factory.js` writes the user-submitted API
// key to a 0600 sidecar file and then calls `host.makeUnconfined`
// on this module with the file's *path* in env. The key bytes
// never enter the Endo daemon's persisted formula JSON.
//
// Expected env:
//   CREDENTIALS_FILE   Absolute path to the 0600 file containing the
//                      Anthropic API key. Read synchronously at startup.
//                      On daemon restart the formula reincarnates with
//                      the same env, re-reads the same file, and the
//                      stored cap continues to work.
//
// The resulting cap exposes the ClaudeCredentials surface documented
// in `claude-credentials-factory.js` — `issue(sessionTag)` returns
// an `IssuedCredential` cap whose `.materialise()` yields the bytes,
// rather than handing back a `{ apiKey }` bag at issue time.

import fs from 'node:fs';

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeError, X, q } from '@endo/errors';

const IssuedCredentialInterface = M.interface('IssuedCredential', {
  materialise: M.call().returns(M.promise()),
  sessionTag: M.call().returns(M.string()),
  help: M.call().optional(M.string()).returns(M.string()),
});

const CredentialsInterface = M.interface('ClaudeCredentials', {
  kind: M.call().returns(M.string()),
  issue: M.call(M.string()).returns(M.promise()),
  revoke: M.call(M.string()).returns(M.promise()),
  rotate: M.call(M.string()).returns(M.promise()),
  help: M.call().optional(M.string()).returns(M.string()),
});

/**
 * Credential kinds and the Claude Code env var each lands in. `apiKey`
 * is a raw Anthropic API key; `oauthToken` is the short-lived OAuth
 * access token Claude Code accepts headlessly (`claude setup-token`).
 */
const CREDENTIAL_KINDS = harden(['apiKey', 'oauthToken']);

/**
 * @param {unknown} _powers
 * @param {unknown} _context
 * @param {object} [contextWrapper]
 * @returns {object}
 */
export const make = (_powers, _context, contextWrapper = {}) => {
  const env = /** @type {any} */ (contextWrapper).env ?? process.env;
  const credentialsFile = env.CREDENTIALS_FILE;
  if (typeof credentialsFile !== 'string' || credentialsFile.length === 0) {
    throw makeError(
      X`claude-credentials-module: CREDENTIALS_FILE required (path to a 0600 sidecar holding the API key)`,
    );
  }
  const credentialKind = env.CREDENTIALS_KIND ?? 'apiKey';
  if (!CREDENTIAL_KINDS.includes(credentialKind)) {
    throw makeError(
      X`claude-credentials-module: CREDENTIALS_KIND ${q(credentialKind)} must be one of ${q(
        CREDENTIAL_KINDS.join(', '),
      )}`,
    );
  }
  let apiKey;
  try {
    // Strip a single trailing newline that the factory writes for
    // operator-friendliness (cat/shred), but keep any internal
    // whitespace verbatim.
    apiKey = fs.readFileSync(credentialsFile, 'utf8').replace(/[\r\n]+$/, '');
  } catch (e) {
    throw makeError(
      X`claude-credentials-module: failed to read CREDENTIALS_FILE ${q(credentialsFile)}: ${q(
        /** @type {Error} */ (e).message,
      )}`,
    );
  }
  if (apiKey.length === 0) {
    throw makeError(
      X`claude-credentials-module: CREDENTIALS_FILE ${q(credentialsFile)} is empty`,
    );
  }

  /** @type {Set<{ invalidate: () => void, tag: string }>} */
  const outstanding = new Set();

  /**
   * @param {string} sessionTag
   */
  const issueCap = sessionTag => {
    let valid = true;
    let materialised = false;
    const handle = {
      tag: sessionTag,
      invalidate: () => {
        valid = false;
      },
    };
    outstanding.add(handle);
    return makeExo('IssuedCredential', IssuedCredentialInterface, {
      async materialise() {
        if (!valid) {
          throw makeError(
            X`IssuedCredential for ${q(sessionTag)} has been revoked or rotated`,
          );
        }
        if (materialised) {
          throw makeError(
            X`IssuedCredential for ${q(sessionTag)} is single-shot; already materialised`,
          );
        }
        materialised = true;
        // A fired single-shot grant can never be used again; drop it from
        // `outstanding` so the set doesn't accumulate dead handles across
        // sessions (a later revoke/rotate of it is already a no-op). Matches
        // the in-process path in claude-credentials-factory.js.
        outstanding.delete(handle);
        return apiKey;
      },
      sessionTag() {
        return sessionTag;
      },
      help(method) {
        if (method === undefined) {
          return [
            'IssuedCredential.',
            '',
            '  materialise() → apiKey   (single-shot; throws after revoke/rotate)',
            '  sessionTag()  → string   (diagnostic)',
          ].join('\n');
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  return makeExo('ClaudeCredentials', CredentialsInterface, {
    kind() {
      return credentialKind;
    },
    async issue(sessionTag) {
      return issueCap(sessionTag);
    },
    async revoke(sessionTag) {
      for (const handle of outstanding) {
        if (handle.tag === sessionTag) {
          handle.invalidate();
          outstanding.delete(handle);
        }
      }
    },
    async rotate(newApiKey) {
      if (typeof newApiKey !== 'string' || newApiKey.length === 0) {
        throw makeError(X`EINVAL: rotate requires a non-empty string`);
      }
      // Write the new key back to the same sidecar file so the
      // rotation survives a daemon restart. Use a tmp + rename to
      // avoid a half-written state.
      const tmp = `${credentialsFile}.tmp`;
      fs.writeFileSync(tmp, `${newApiKey}\n`, { mode: 0o600 });
      fs.renameSync(tmp, credentialsFile);
      apiKey = newApiKey;
      for (const handle of outstanding) handle.invalidate();
      outstanding.clear();
    },
    help(method) {
      if (method === undefined) {
        return [
          'ClaudeCredentials.',
          '',
          '  kind()             → "apiKey" | "oauthToken"',
          '  issue(sessionTag)  → IssuedCredential   (call .materialise())',
          "  revoke(sessionTag) → ()                 close a session's grants",
          '  rotate(newApiKey)  → ()                 replace the stored key',
        ].join('\n');
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
};
harden(make);
