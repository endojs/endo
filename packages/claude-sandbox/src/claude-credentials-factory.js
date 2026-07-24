// @ts-check
/* eslint-disable no-await-in-loop */
/* global process */

/**
 * ClaudeCredentials factory caplet.
 *
 * A form-mintable Endo capability that wraps an Anthropic API key.
 * A user submits the form on `@host` with an API key; the factory:
 *
 *  1. Writes the key bytes to a sidecar file at
 *     `${CLAUDE_CREDENTIALS_DIR}/${name}.key` with mode 0600. The
 *     directory is created 0700 on first use.
 *  2. Mints a `ClaudeCredentials` exo under the chosen pet name via
 *     `makeUnconfined` on `claude-credentials-module.js`. The
 *     formula's `env` carries the *path* (`CREDENTIALS_FILE`), not
 *     the key bytes. This keeps the key out of the formula JSON
 *     store and avoids reincarnating the secret through the Endo
 *     daemon's persisted state.
 *
 * The minted cap's surface:
 *
 *   ClaudeCredentials.issue(sessionTag)   → IssuedCredential cap
 *     — opens a session-scoped grant. Returns a *capability*, not a
 *       plain `{apiKey}` bag, so the key bytes only flow over CapTP
 *       at the moment a consumer calls `.materialise()` rather than
 *       at issue time.
 *
 *   ClaudeCredentials.revoke(sessionTag)  → void
 *     — invalidates every IssuedCredential previously minted for
 *       that sessionTag (future `materialise()` calls throw).
 *
 *   ClaudeCredentials.rotate(newApiKey)   → void
 *     — replace the stored key and invalidate every outstanding
 *       IssuedCredential, regardless of sessionTag.
 *
 *   ClaudeCredentials.help()              → string
 *
 * IssuedCredential surface:
 *
 *   IssuedCredential.materialise()        → string
 *     — return the current key bytes. Throws after `revoke` of the
 *       same sessionTag, after `rotate`, or after a second
 *       `materialise` (single-shot).
 *
 *   IssuedCredential.sessionTag()         → string
 *     — diagnostic accessor for the tag this cap was issued under.
 *
 * The factory is unconfined and trusted with the submitted key
 * bytes — the caplet's source is part of the trusted compute base.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { makeError, X, q } from '@endo/errors';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

/** @import { FarRef } from '@endo/eventual-send' */

/**
 * Subset of the inbox message shape this caplet cares about. The
 * `@host` inbox API is dynamically typed at the Endo boundary; we
 * narrow at the read site.
 *
 * @typedef {object} InboxMessage
 * @property {string} from
 * @property {'form' | 'value' | string} type
 * @property {string} [messageId]
 * @property {string} [replyTo]
 * @property {number} number
 * @property {string} [valueId]
 */

/**
 * Subset of the credentials form submission.
 *
 * @typedef {object} CredentialsFormSubmission
 * @property {string} name
 * @property {string} apiKey
 * @property {string} [kind] - `apiKey` (default) or `oauthToken`.
 */

/**
 * Constructor wrapper passed by Endo when the caplet is unconfined.
 *
 * @typedef {object} CredsContextOrDeps
 * @property {Record<string, string>} [env]
 * @property {boolean} [inProcessFactory]
 * @property {(readerRef: any) => AsyncIterator<any>} [iterateMessages]
 */

const CREDENTIALS_MODULE_SPECIFIER = new URL(
  './claude-credentials-module.js',
  import.meta.url,
).href;

const FactoryInterface = M.interface('ClaudeCredentialsFactory', {
  help: M.call().optional(M.string()).returns(M.string()),
});

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
 * Credential kinds. `apiKey` is a raw Anthropic API key
 * (`ANTHROPIC_API_KEY`); `oauthToken` is the short-lived OAuth access
 * token Claude Code accepts headlessly (`CLAUDE_CODE_OAUTH_TOKEN`, as
 * minted by `claude setup-token`).
 */
const CREDENTIAL_KINDS = harden(['apiKey', 'oauthToken']);

const FORM_DESCRIPTION = 'Create Claude Credentials';

const FORM_FIELDS = harden([
  {
    name: 'name',
    label: 'Pet name for the new ClaudeCredentials cap',
    default: 'claude-credentials',
  },
  {
    name: 'kind',
    label: 'Credential kind',
    default: 'apiKey',
    example: 'apiKey | oauthToken',
  },
  {
    name: 'apiKey',
    label: 'Anthropic API key (sk-ant-...) or OAuth token (claude setup-token)',
    example: 'sk-ant-... | sk-ant-oat...',
    secret: true,
  },
]);

/**
 * Validate a credential pet name before letting it land in a file
 * path. Restrict to the same shape Endo's pet-name validator uses
 * (lowercase + digits + hyphens) so this can't escape the directory.
 *
 * @param {string} name
 */
const assertSafeCredentialName = name => {
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(name)) {
    throw makeError(X`Invalid credential name: ${q(name)}`);
  }
};

/**
 * Resolve the directory we keep credential files in. Configurable
 * via env so the daemon owner can keep keys under a state directory
 * rather than `$HOME`.
 */
const credentialsDir = () =>
  process.env.CLAUDE_CREDENTIALS_DIR ||
  path.join(os.homedir(), '.endo-claude-credentials');

/**
 * Write `apiKey` to `<credentialsDir>/<name>.key` with 0600 perms,
 * creating the parent dir 0700 if it doesn't exist. Returns the
 * absolute file path.
 *
 * @param {string} name
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
const persistKeyToSidecar = async (name, apiKey) => {
  assertSafeCredentialName(name);
  const dir = credentialsDir();
  await mkdir(dir, { mode: 0o700, recursive: true });
  const file = path.join(dir, `${name}.key`);
  // 0600 at create time — no chmod-after window. Trailing newline so
  // the file is amenable to `cat`/`shred` on the operator side.
  await writeFile(file, `${apiKey}\n`, { mode: 0o600 });
  return file;
};

/**
 * Build a `ClaudeCredentials` exo holding `apiKey` in memory.
 * Used by the test path (`inProcessFactory: true`); the production
 * path goes through `makeUnconfined` of `claude-credentials-module.js`,
 * which reads the key from a sidecar file rather than the formula env.
 *
 * @param {string} initialKey
 * @param {string} [kind] - `apiKey` (default) or `oauthToken`.
 */
export const makeCredentialsExo = (initialKey, kind = 'apiKey') => {
  if (!CREDENTIAL_KINDS.includes(kind)) {
    throw makeError(
      X`credential kind ${q(kind)} must be one of ${q(CREDENTIAL_KINDS.join(', '))}`,
    );
  }
  let apiKey = initialKey;
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
    const ic = makeExo('IssuedCredential', IssuedCredentialInterface, {
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
        // A single-shot grant that has fired can never be used again, so
        // drop it from `outstanding` (a later revoke/rotate of it is a
        // no-op anyway). This bounds `outstanding` to grants that have not
        // yet materialised, rather than leaking a handle per issued grant
        // whose session never calls revoke.
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
        return `No documentation for method "${q(method)}".`;
      },
    });
    return ic;
  };

  return makeExo('ClaudeCredentials', CredentialsInterface, {
    kind() {
      return kind;
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
      apiKey = newApiKey;
      // Outstanding grants reference the *old* key bytes; invalidate
      // them so subsequent `materialise()` calls see the rotation.
      for (const handle of outstanding) handle.invalidate();
      outstanding.clear();
    },
    help(method) {
      if (method === undefined) {
        return [
          'ClaudeCredentials.',
          '',
          '  issue(sessionTag) → IssuedCredential   (call .materialise() to get the key)',
          "  revoke(sessionTag) → ()                close a session's grants",
          '  rotate(newApiKey) → ()                 replace the stored key',
        ].join('\n');
      }
      return `No documentation for method "${q(method)}".`;
    },
  });
};
harden(makeCredentialsExo);

/**
 * Factory caplet for `ClaudeCredentials`.
 *
 * @param {FarRef<object>} guestPowers
 * @param {Promise<object> | object | undefined} _context
 * @param {CredsContextOrDeps} [contextOrDeps]
 * @returns {object}
 */
export const make = (guestPowers, _context, contextOrDeps = {}) => {
  /** @type {any} */
  const powers = guestPowers;
  // `contextOrDeps` is overloaded the same way the
  // ClaudeSandboxFactory's third arg is: when called by the
  // worker's makeUnconfined path it's `{ env: {...} }`; tests
  // can pass `{ inProcessFactory: true }` to bypass the daemon-
  // formulated path and mint a worker-local exo via
  // `makeCredentialsExo`.
  const deps = contextOrDeps;
  const iterateMessages = deps.iterateMessages ?? iterateReader;

  const seenFormReplies = new Set();

  const runFactory = async () => {
    await E(powers).form('@host', FORM_DESCRIPTION, FORM_FIELDS);
    const hostAgent = await E(powers).lookup('host-agent');
    const selfId = await E(powers).locate('@self');

    /** @type {string | undefined} */
    let formMessageId;
    const existingMessages = /** @type {InboxMessage[]} */ (
      await E(powers).listMessages()
    );
    for (const msg of existingMessages) {
      if (msg.from === selfId && msg.type === 'form') {
        formMessageId = msg.messageId;
      }
    }

    const messageIterator = iterateMessages(E(powers).followMessages());
    let exhausted = false;
    while (!exhausted) {
      const { value: message, done } = await messageIterator.next();
      if (done) {
        exhausted = true;
        break;
      }
      const msg = /** @type {InboxMessage} */ (message);
      const isOurForm = msg.from === selfId && msg.type === 'form';
      const isFormReply =
        msg.type === 'value' &&
        formMessageId !== undefined &&
        msg.replyTo === formMessageId &&
        !seenFormReplies.has(msg.number);

      if (isOurForm) {
        formMessageId = msg.messageId;
      } else if (isFormReply) {
        seenFormReplies.add(msg.number);
        try {
          const submission = /** @type {CredentialsFormSubmission} */ (
            await E(powers).lookupById(msg.valueId)
          );
          const { name, apiKey, kind = 'apiKey' } = submission;
          if (!name) throw new Error('Missing "name".');
          if (!apiKey || typeof apiKey !== 'string') {
            throw new Error('Missing "apiKey".');
          }
          if (!CREDENTIAL_KINDS.includes(kind)) {
            throw new Error(
              `Unknown credential kind "${kind}"; expected one of ${CREDENTIAL_KINDS.join(', ')}.`,
            );
          }
          assertSafeCredentialName(name);
          if (deps.inProcessFactory) {
            // Test path: bypass daemon-formulated minting and the
            // sidecar file. The exo holds the bytes in memory only.
            const credentials = makeCredentialsExo(apiKey, kind);
            await E(hostAgent).storeValue(credentials, name);
          } else {
            // Production path: write key bytes to a 0600 sidecar
            // file and reference *the path* (not the bytes) from
            // the formula env. The module re-reads the file on
            // reincarnation.
            const credentialsFile = await persistKeyToSidecar(name, apiKey);
            await E(hostAgent).makeUnconfined(
              '@main',
              CREDENTIALS_MODULE_SPECIFIER,
              {
                powersName: '@none',
                resultName: name,
                env: harden({
                  CREDENTIALS_FILE: credentialsFile,
                  CREDENTIALS_KIND: kind,
                }),
              },
            );
          }
          await E(powers).reply(
            msg.number,
            [`ClaudeCredentials "${name}" created.`],
            [],
            [],
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          // eslint-disable-next-line no-console
          console.error('[claude-credentials-factory]', errorMessage);
          try {
            await E(powers).reply(
              msg.number,
              [`Error creating credentials: ${errorMessage}`],
              [],
              [],
            );
          } catch {
            // best-effort
          }
        }
      }
    }
  };

  runFactory().catch(error => {
    // eslint-disable-next-line no-console
    console.error('[claude-credentials-factory] Factory error:', error);
  });

  return makeExo('ClaudeCredentialsFactory', FactoryInterface, {
    help(method) {
      if (method === undefined) {
        return [
          'ClaudeCredentialsFactory.',
          '',
          'Submit the "Create Claude Credentials" form on @host with:',
          '  name   — pet name for the resulting ClaudeCredentials',
          '  kind   — apiKey (default) or oauthToken',
          '  apiKey — Anthropic API key, or an OAuth token (claude setup-token)',
          '',
          'The key is persisted to a 0600 sidecar file under',
          '`$CLAUDE_CREDENTIALS_DIR` (default `~/.endo-claude-credentials`).',
          'The Endo formula store sees only the file path, not the key.',
        ].join('\n');
      }
      return `No documentation for method "${q(method)}".`;
    },
  });
};
harden(make);
