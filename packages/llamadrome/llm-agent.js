// @ts-check

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

import { createOllamaBackend } from './ollama-backend.js';
import { createAnthropicBackend } from './anthropic-backend.js';

const LlamadromeInterface = M.interface('Llamadrome', {
  help: M.call().returns(M.string()),
});

/**
 * Create a Llamadrome LLM agent as an Endo guest module.
 *
 * Selects the LLM backend based on the LLM_BACKEND environment variable
 * ("ollama" or "anthropic", defaulting to "ollama"). Listens for incoming
 * messages, forwards them to the backend, and sends responses to HOST.
 *
 * @param {import('@endo/daemon/src/types.js').FarEndoGuest} powers
 */
export const make = powers => {
  const backendType = process.env.LLM_BACKEND || 'ollama';
  const backend =
    backendType === 'anthropic'
      ? createAnthropicBackend(powers)
      : createOllamaBackend(powers);

  (async () => {
    const selfId = await E(powers).identify('SELF');
    await E(powers).send('HOST', ['Llamadrome ready for work.'], [], []);

    for await (const message of makeRefIterator(E(powers).followMessages())) {
      const { from: fromId, strings, names } = message;

      if (fromId === selfId) {
        continue;
      }

      const userContent = strings
        .map((fragment, i) =>
          i < names.length ? `${fragment} @${names[i]}` : fragment,
        )
        .join(' ');

      try {
        const response = await backend.processMessage(userContent);
        await E(powers).send('HOST', [response], [], []);
      } catch (e) {
        await E(powers).send(
          'HOST',
          [`Error: ${/** @type {Error} */ (e).message}`],
          [],
          [],
        );
      }
    }
  })();

  return makeExo('Llamadrome', LlamadromeInterface, {
    help() {
      return 'Llamadrome LLM agent. Receives messages and proposes code for evaluation.';
    },
  });
};
harden(make);
