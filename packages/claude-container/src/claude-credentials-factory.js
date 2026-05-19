// @ts-nocheck — E() generics don't compose well with JSDoc for remote objects.
/* eslint-disable no-await-in-loop */

/**
 * ClaudeCredentials factory caplet (R3, ENDO-INTEGRATION.md §9).
 *
 * Replaces the out-of-band broker config file (the v1 approach
 * documented in DESIGN.md §5.5) with a form-mintable Endo
 * capability. A user submits the form on @host with an Anthropic
 * API key; the factory stores the key inside a `ClaudeCredentials`
 * exo that lives in @host's petstore and gates access via:
 *
 *   ClaudeCredentials.issue(sessionId)       → { apiKey }
 *     — opens a session-scoped grant. Currently returns the raw
 *       key bundled in a fresh record; a future v2 could mint a
 *       short-lived scoped token via Anthropic's API.
 *
 *   ClaudeCredentials.revoke(sessionId)      → void
 *     — closes a session's grant. v1 is a no-op (no per-session
 *       state tracked); future v2 would invalidate the issued
 *       record.
 *
 *   ClaudeCredentials.rotate(newApiKey)      → void
 *     — replace the stored key.
 *
 *   ClaudeCredentials.help()                 → string
 *
 * The factory itself is unconfined and trusted with the
 * submitted API key — the caplet's source is part of the
 * trusted compute base, same as the existing ClaudeContainer
 * factory.
 */

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { makeError, X, q } from '@endo/errors';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

const CREDENTIALS_MODULE_SPECIFIER = new URL(
  './claude-credentials-module.js',
  import.meta.url,
).href;

const FactoryInterface = M.interface('ClaudeCredentialsFactory', {
  help: M.call().optional(M.string()).returns(M.string()),
});

const CredentialsInterface = M.interface('ClaudeCredentials', {
  issue: M.call(M.string()).returns(M.promise()),
  revoke: M.call(M.string()).returns(M.promise()),
  rotate: M.call(M.string()).returns(M.promise()),
  help: M.call().optional(M.string()).returns(M.string()),
});

const FORM_DESCRIPTION = 'Create Claude Credentials';

const FORM_FIELDS = harden([
  {
    name: 'name',
    label: 'Pet name for the new ClaudeCredentials cap',
    default: 'claude-credentials',
  },
  {
    name: 'apiKey',
    label: 'Anthropic API key (sk-ant-...)',
    example: 'sk-ant-...',
    secret: true,
  },
]);

/**
 * Build a `ClaudeCredentials` exo holding `apiKey`.
 *
 * @param {string} initialKey
 */
const makeCredentialsExo = initialKey => {
  let apiKey = initialKey;
  return makeExo('ClaudeCredentials', CredentialsInterface, {
    async issue(_sessionId) {
      return harden({ apiKey });
    },
    async revoke(_sessionId) {
      // v1: no per-session state to invalidate. v2 may track
      // issued tokens for revocation.
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
          '  issue(sessionId) → { apiKey }   open a session-scoped grant',
          '  revoke(sessionId) → ()          close a session\'s grant',
          '  rotate(newApiKey) → ()          replace the stored key',
        ].join('\n');
      }
      return `No documentation for method "${method}".`;
    },
  });
};

/**
 * Factory caplet for `ClaudeCredentials`. Same form-loop shape as
 * the existing `ClaudeContainer` factory.
 *
 * @param {import('@endo/eventual-send').FarRef<object>} guestPowers
 */
export const make = (guestPowers, _context, contextOrDeps = {}) => {
  /** @type {any} */
  const powers = guestPowers;
  // `contextOrDeps` is overloaded the same way the
  // ClaudeContainerFactory's third arg is: when called by the
  // worker's makeUnconfined path it's `{ env: {...} }`; tests
  // can pass `{ inProcessFactory: true }` to bypass the daemon-
  // formulated path and mint a worker-local exo via
  // `makeCredentialsExo`.
  const deps = contextOrDeps;

  const seenFormReplies = new Set();

  const runFactory = async () => {
    await E(powers).form('@host', FORM_DESCRIPTION, FORM_FIELDS);
    const hostAgent = await E(powers).lookup('host-agent');
    const selfId = await E(powers).locate('@self');

    /** @type {string | undefined} */
    let formMessageId;
    const existingMessages = await E(powers).listMessages();
    for (const msg of existingMessages) {
      if (msg.from === selfId && msg.type === 'form') {
        formMessageId = msg.messageId;
      }
    }

    const messageIterator = makeRefIterator(E(powers).followMessages());
    let exhausted = false;
    while (!exhausted) {
      const { value: message, done } = await messageIterator.next();
      if (done) {
        exhausted = true;
        break;
      }
      const msg = message;
      const isOurForm = msg.from === selfId && msg.type === 'form';
      const isFormReply =
        msg.type === 'value' &&
        msg.replyTo === formMessageId &&
        !seenFormReplies.has(msg.number);

      if (isOurForm) {
        formMessageId = msg.messageId;
      } else if (isFormReply) {
        seenFormReplies.add(msg.number);
        try {
          const submission = await E(powers).lookupById(msg.valueId);
          const { name, apiKey } = submission;
          if (!name) throw new Error('Missing "name".');
          if (!apiKey || typeof apiKey !== 'string') {
            throw new Error('Missing "apiKey".');
          }
          // Mint via makeUnconfined so the resulting cap is a
          // formulated caplet that survives daemon restarts. The
          // module reads its API key from env.
          if (deps.inProcessFactory) {
            // Test path: bypass daemon-formulated minting.
            const credentials = makeCredentialsExo(apiKey);
            await E(hostAgent).storeValue(credentials, name);
          } else {
            await E(hostAgent).makeUnconfined(
              '@main',
              CREDENTIALS_MODULE_SPECIFIER,
              {
                powersName: '@none',
                resultName: name,
                env: harden({ API_KEY: apiKey }),
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
          '  apiKey — Anthropic API key',
        ].join('\n');
      }
      return `No documentation for method "${q(method)}".`;
    },
  });
};
harden(make);
