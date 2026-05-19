// @ts-nocheck — E() generics don't compose well with JSDoc for remote objects.
/* eslint-disable no-await-in-loop */
/* global process */

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

import { makeOrchestratorClient } from './orchestrator-client.js';

const CLAUDE_CLIENT_MODULE_SPECIFIER = new URL(
  './claude-client-module.js',
  import.meta.url,
).href;
const FS_BRIDGE_MODULE_SPECIFIER = new URL(
  './fs-bridge-module.js',
  import.meta.url,
).href;

const FactoryInterface = M.interface('ClaudeContainerFactory', {
  help: M.call().optional(M.string()).returns(M.string()),
});

const FORM_DESCRIPTION = 'Create Claude Container';

const FORM_FIELDS = harden([
  {
    name: 'name',
    label: 'Pet name for the new ClaudeClient',
    default: 'claude-1',
  },
  {
    name: 'filesystem',
    label: 'Pet name of an FS capability already in @host petstore',
    example: 'Examples: my-workspace, project-fs',
  },
  {
    name: 'network',
    label: 'Network mode',
    default: 'egress',
    example: 'egress | none',
  },
  {
    name: 'model',
    label: 'Claude model id (optional)',
    default: '',
    example: 'Examples: claude-sonnet-4-6, claude-opus-4-7',
  },
  {
    name: 'credentials',
    label: 'Pet name of a ClaudeCredentials cap (optional)',
    default: '',
    example: 'Examples: claude-credentials',
  },
  {
    name: 'initialPrompt',
    label: 'Initial prompt (optional)',
    default: '',
  },
]);

/**
 * Factory caplet: presents a form on @host's inbox. Each submission
 * resolves the named filesystem capability, talks to the host
 * orchestrator (see DESIGN.md §6.1), wires up a 9P bridge over the
 * orchestrator's per-session UDS, and exposes the resulting Claude
 * Code instance as a ClaudeClient exo stored under the chosen pet
 * name.
 *
 * The third argument is overloaded: when called by Endo's worker
 * (`makeUnconfined` path) it is the frozen `{ env }` wrapper produced
 * in `worker.js`. Tests bypass that path and pass injectable deps
 * (`orchestrator`, `bridgeFactory`, `clientFactory`) instead.
 * `env` from the wrapper, when present, overrides `process.env`
 * because `process.env` reflects the daemon's environment, not the
 * env requested by the caller of `makeUnconfined`.
 *
 * @param {import('@endo/eventual-send').FarRef<object>} guestPowers
 * @param {Promise<object> | object | undefined} _context
 * @param {object} [contextOrDeps]
 * @returns {object}
 */
export const make = (guestPowers, _context, contextOrDeps = {}) => {
  /** @type {any} */
  const powers = guestPowers;

  const env = contextOrDeps.env ?? {};
  const deps = contextOrDeps;
  const orchestratorSocket =
    env.ORCHESTRATOR_SOCKET ||
    process.env.ORCHESTRATOR_SOCKET ||
    '/run/claude-orch/api.sock';
  const orchestrator =
    deps.orchestrator ??
    makeOrchestratorClient({ socketPath: orchestratorSocket });
  // Live-daemon path provisions per-session caplets via
  // `hostAgent.makeUnconfined` so both the 9P bridge and the
  // ClaudeClient exo are first-class Endo capabilities that
  // reincarnate from their env on daemon restart. Tests bypass this
  // by providing `bridgeFactory` and `clientFactory` directly to
  // construct worker-local instances without going through the
  // daemon's formula machinery.
  const inProcessBridgeFactory = deps.bridgeFactory ?? null;
  const inProcessClientFactory = deps.clientFactory ?? null;

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
          const {
            name,
            filesystem: fsName,
            network = 'egress',
            model,
            credentials: credsName,
            initialPrompt,
          } = submission;

          if (!name) throw new Error('Missing "name".');
          if (!fsName) throw new Error('Missing "filesystem" pet name.');

          const fs = await E(hostAgent).lookup(fsName);
          if (!fs) throw new Error(`Unknown filesystem: "${fsName}".`);

          // Resolve a caller-supplied ClaudeCredentials cap (R3)
          // if the form provided a pet name. The cap's
          // `issue(sessionId)` is session-scoped, but we don't
          // know the session id yet at this call site, so we
          // issue against the client pet name as a stand-in
          // tag. The base ClaudeCredentials in v1 ignores the
          // tag; v2 (revocation) may use it.
          let resolvedCreds;
          if (typeof credsName === 'string' && credsName.length > 0) {
            const credCap = await E(hostAgent).lookup(credsName);
            if (!credCap) {
              throw new Error(`Unknown credentials: "${credsName}".`);
            }
            resolvedCreds = await E(credCap).issue(name);
          }

          const session = await orchestrator.createSession({
            network,
            attachMode: 'stream',
            ...(resolvedCreds ? { credentials: resolvedCreds } : {}),
          });

          const bridgeName = `bridge-for-${session.id}`;
          if (inProcessBridgeFactory) {
            // Test path: build and start the bridge directly inside the
            // factory worker, no formula round-trip.
            const bridge = inProcessBridgeFactory({
              fs,
              socketPath: session.fsSocketPath,
            });
            await E(bridge).start();
          } else {
            // Live path: provision the bridge as its own formulated
            // caplet under HOST. The module starts the 9P listener
            // eagerly inside `make()`, so by the time this resolves
            // the UDS is ready for the orchestrator to mount through.
            // Reincarnation after a daemon restart re-runs `make()`
            // with the same env, automatically re-binding the same
            // FS_SOCKET_PATH against a re-resolved FS pet name —
            // that's the caplet-side bridge re-attach for R4.
            await E(hostAgent).makeUnconfined(
              '@main',
              FS_BRIDGE_MODULE_SPECIFIER,
              {
                powersName: '@agent',
                resultName: bridgeName,
                env: harden({
                  FS_NAME: fsName,
                  FS_SOCKET_PATH: session.fsSocketPath ?? '',
                }),
              },
            );
          }

          await orchestrator.markReady(session.id);

          if (inProcessClientFactory) {
            // Test path: client lives in the factory worker; we keep
            // the in-worker bridge alive via the closure above.
            const client = inProcessClientFactory({
              session,
              orchestrator,
              bridge: undefined,
              model,
              initialPrompt,
            });
            await E(hostAgent).storeValue(client, name);
          } else {
            await E(hostAgent).makeUnconfined(
              '@main',
              CLAUDE_CLIENT_MODULE_SPECIFIER,
              {
                powersName: '@none',
                resultName: name,
                env: harden({
                  ORCHESTRATOR_SOCKET: orchestratorSocket,
                  SESSION_ID: session.id,
                  FS_SOCKET_PATH: session.fsSocketPath ?? '',
                  ATTACH_SOCKET_PATH: session.attachSocketPath ?? '',
                  CREATED_AT: session.createdAt ?? '',
                  MODEL: model ?? '',
                  INITIAL_PROMPT: initialPrompt ?? '',
                }),
              },
            );
          }

          await E(powers).reply(
            msg.number,
            [
              `ClaudeClient "${name}" created.`,
              `  session: ${session.id}`,
              `  filesystem: ${fsName}`,
              `  network: ${network}`,
            ],
            [],
            [],
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error('[claude-container-factory]', errorMessage);
          try {
            await E(powers).reply(
              msg.number,
              [`Error creating container: ${errorMessage}`],
              [],
              [],
            );
          } catch {
            // Best-effort reply.
          }
        }
      }
    }
  };

  runFactory().catch(error => {
    console.error('[claude-container-factory] Factory error:', error);
  });

  return makeExo('ClaudeContainerFactory', FactoryInterface, {
    /**
     * @param {string} [methodName]
     * @returns {string}
     */
    help(methodName) {
      if (methodName === undefined) {
        return [
          'ClaudeContainerFactory.',
          '',
          'Submit the "Create Claude Container" form on @host with:',
          '  name        — pet name for the resulting ClaudeClient',
          '  filesystem  — pet name of an existing FS capability',
          '  network     — "egress" or "none" (default egress)',
          '  model       — optional claude model id',
          '  initialPrompt — optional first message',
        ].join('\n');
      }
      return `No documentation for method "${methodName}".`;
    },
  });
};
harden(make);
