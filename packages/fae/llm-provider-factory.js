// @ts-nocheck - E() generics don't work well with JSDoc types for remote objects

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

const ProviderFactoryInterface = M.interface('LLMProviderFactory', {
  help: M.call().optional(M.string()).returns(M.string()),
});

/**
 * Caplet that presents a form for creating LLM provider configs.
 *
 * On each form submission, stores `{ host, model, authToken }` as a
 * named value in the HOST agent's petstore so it's accessible to
 * everything.
 *
 * @param {import('@endo/eventual-send').FarRef<object>} guestPowers
 * @param {Promise<object> | object | undefined} _context
 * @returns {object}
 */
export const make = (guestPowers, _context) => {
  /** @type {any} */
  const powers = guestPowers;

  const runFactory = async () => {
    await E(powers).form(
      '@host',
      'Create LLM Provider',
      harden([
        { name: 'name', label: 'Provider name', default: 'default' },
        {
          name: 'host',
          label: 'API host',
          default: 'https://api.anthropic.com',
          example: 'http://localhost:11434/v1 for Ollama',
        },
        {
          name: 'model',
          label: 'Model name',
          default: 'claude-sonnet-4-6-20250514',
          example: 'qwen3 for Ollama',
        },
        {
          name: 'authToken',
          label: 'API auth token',
          example: 'sk-ant-...',
          secret: true,
        },
      ]),
    );

    const hostAgent = await E(powers).lookup('host-agent');
    const selfId = await E(powers).locate('@self');

    /** @type {string | undefined} */
    let formMessageId;
    const existingMessages = /** @type {any[]} */ (
      await E(powers).listMessages()
    );
    for (const msg of existingMessages) {
      if (msg.from === selfId && msg.type === 'form') {
        formMessageId = msg.messageId;
      }
    }

    const messageIterator = makeRefIterator(E(powers).followMessages());
    while (true) {
      const { value: message, done } = await messageIterator.next();
      if (done) break;

      const msg = /** @type {any} */ (message);

      if (msg.from === selfId && msg.type === 'form') {
        formMessageId = msg.messageId;
        continue;
      }

      if (msg.type !== 'value') continue;
      if (msg.replyTo !== formMessageId) continue;

      try {
        const config =
          /** @type {{ name: string, host: string, model: string, authToken: string }} */ (
            await E(powers).lookupById(msg.valueId)
          );

        const { name, host, model, authToken } = config;

        await E(hostAgent).storeValue(harden({ host, model, authToken }), name);

        console.log(`[llm-provider-factory] Provider "${name}" stored.`);
        await E(powers).reply(
          msg.number,
          [`Provider "${name}" created successfully.`],
          [],
          [],
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error('[llm-provider-factory] Error:', errorMessage);
        try {
          await E(powers).reply(
            msg.number,
            [`Error creating provider: ${errorMessage}`],
            [],
            [],
          );
        } catch {
          // Best-effort reply.
        }
      }
    }
  };

  runFactory().catch(error => {
    console.error('[llm-provider-factory] Factory error:', error);
  });

  return makeExo('LLMProviderFactory', ProviderFactoryInterface, {
    /**
     * @param {string} [methodName]
     * @returns {string}
     */
    help(methodName) {
      if (methodName === undefined) {
        return 'LLM Provider Factory: submit the form to create provider configs stored in HOST petstore.';
      }
      return `No documentation for method "${methodName}".`;
    },
  });
};
harden(make);
