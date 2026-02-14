// @ts-check
/* global process */
/* eslint-disable no-continue */

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

import { createOllamaBackend } from './ollama-backend.js';
import { createAnthropicBackend } from './anthropic-backend.js';
import { loadConversation } from './conversation-store.js';

const LlamadromeInterface = M.interface('Llamadrome', {
  help: M.call().returns(M.string()),
});

/**
 * Create a Llamadrome LLM agent as an Endo guest module.
 *
 * Selects the LLM backend based on the LLM_BACKEND environment variable
 * ("ollama" or "anthropic", defaulting to "ollama"). Loads saved conversation
 * state on startup so the agent survives daemon restarts. Resumes pending
 * tool calls that were interrupted by a restart.
 *
 * @param {import('@endo/daemon/src/types.js').FarEndoGuest} powers
 */
export const make = powers => {
  (async () => {
    // Load saved conversation state if available
    const savedState = await loadConversation(powers);
    const initialMessages = savedState ? savedState.messages : undefined;

    const backendType = process.env.LLM_BACKEND || 'ollama';
    const backend =
      backendType === 'anthropic'
        ? createAnthropicBackend(
            powers,
            initialMessages,
            savedState ? savedState.pendingToolCalls : undefined,
          )
        : createOllamaBackend(powers, initialMessages);

    // Restore last seen message number from saved state
    if (savedState && savedState.lastSeenNumber !== undefined) {
      backend.setLastSeenNumber(savedState.lastSeenNumber);
    }

    if (savedState) {
      await E(powers).send(
        'HOST',
        ['Llamadrome resumed with saved conversation state.'],
        [],
        [],
      );

      // Resume any pending tool calls from before the restart
      if (backendType === 'anthropic' && 'resumePending' in backend) {
        try {
          const resumeResult = await backend.resumePending();
          if (resumeResult !== null) {
            await E(powers).send('HOST', [resumeResult], [], []);
          }
        } catch (e) {
          await E(powers).send(
            'HOST',
            [
              `Error resuming pending tool calls: ${/** @type {Error} */ (e).message}`,
            ],
            [],
            [],
          );
        }
      }
    } else {
      await E(powers).send('HOST', ['Llamadrome ready for work.'], [], []);
    }

    for await (const message of makeRefIterator(E(powers).followMessages())) {
      const { number: messageNumber, fromNames } = message;

      if (fromNames.includes('SELF')) {
        continue;
      }

      // Skip messages already processed before a restart
      const lastSeen = backend.getLastSeenNumber();
      if (
        lastSeen !== undefined &&
        messageNumber <= /** @type {bigint} */ (lastSeen)
      ) {
        continue;
      }

      // Only process package messages that have strings
      if (!message.strings) {
        continue;
      }

      const { strings, names } = message;
      const nameList = /** @type {string[]} */ (names || []);
      const userContent = strings
        .map((fragment, i) =>
          i < nameList.length ? `${fragment} @${nameList[i]}` : fragment,
        )
        .join(' ');

      try {
        backend.setLastSeenNumber(messageNumber);
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
      return 'Llamadrome LLM agent. Receives messages and proposes code for evaluation. Conversation state is persisted across daemon restarts.';
    },
  });
};
harden(make);
