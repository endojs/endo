// @ts-nocheck — E() generics don't compose well with JSDoc for remote objects.
/* eslint-disable no-await-in-loop */
/* global process */

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

import { makeClaudeClient } from './claude-client.js';
import { makeOrchestratorClient } from './orchestrator-client.js';
import { makeFsBridge9p } from './fs-bridge-9p.js';

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
 * @param {import('@endo/eventual-send').FarRef<object>} guestPowers
 * @param {Promise<object> | object | undefined} _context
 * @returns {object}
 */
export const make = (guestPowers, _context, deps = {}) => {
  /** @type {any} */
  const powers = guestPowers;

  // Dependencies are injectable for tests; defaults wire the real
  // orchestrator client + 9P bridge factory.
  const orchestratorSocket =
    process.env.ORCHESTRATOR_SOCKET || '/run/claude-orch/api.sock';
  const orchestrator =
    deps.orchestrator ??
    makeOrchestratorClient({ socketPath: orchestratorSocket });
  const bridgeFactory = deps.bridgeFactory ?? makeFsBridge9p;
  const clientFactory = deps.clientFactory ?? makeClaudeClient;

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
            initialPrompt,
          } = submission;

          if (!name) throw new Error('Missing "name".');
          if (!fsName) throw new Error('Missing "filesystem" pet name.');

          const fs = await E(hostAgent).lookup(fsName);
          if (!fs) throw new Error(`Unknown filesystem: "${fsName}".`);

          const session = await orchestrator.createSession({
            network,
            attachMode: 'stream',
          });

          const bridge = bridgeFactory({
            fs,
            socketPath: session.fsSocketPath,
          });
          await E(bridge).start();

          await orchestrator.markReady(session.id);

          const client = clientFactory({
            session,
            orchestrator,
            bridge,
            model,
            initialPrompt,
          });

          await E(hostAgent).storeValue(client, name);

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
