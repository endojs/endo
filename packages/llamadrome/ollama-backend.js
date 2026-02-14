// @ts-check

/** @import { FarEndoGuest } from '@endo/daemon/src/types.js' */
/** @import { LLMConfig } from './llm-agent.js' */

import { E } from '@endo/eventual-send';
import { Ollama } from 'ollama';
import { getSystemPrompt } from './system-prompt.js';
import { saveConversation } from './conversation-store.js';

/**
 * @typedef {{ processMessage: (userContent: string) => Promise<string>, setLastSeenNumber: (n: bigint) => void, getLastSeenNumber: () => bigint | undefined }} LLMBackend
 */

/**
 * Create an Ollama-based LLM backend.
 *
 * Manages a conversation transcript and sends messages to an Ollama instance.
 * Best-effort extraction of fenced code blocks triggers requestEvaluation.
 *
 * @param {FarEndoGuest} powers - Endo guest powers
 * @param {LLMConfig} config - LLM configuration from setup
 * @param {Array<{role: string, content: unknown}>} [initialMessages] - Optional saved conversation history
 * @returns {LLMBackend}
 */
export const createOllamaBackend = (powers, config, initialMessages) => {
  const ollama = new Ollama({
    ...(config.ollamaHost && {
      host: config.ollamaHost,
    }),
    headers: {
      ...(config.ollamaApiKey && {
        Authorization: `Bearer ${config.ollamaApiKey}`,
      }),
    },
  });

  const transcript = initialMessages
    ? [...initialMessages]
    : [{ role: 'system', content: getSystemPrompt() }];

  /** @type {bigint | undefined} */
  let lastSeenNumber;

  /**
   * @param {bigint} n
   */
  const setLastSeenNumber = n => {
    lastSeenNumber = n;
  };

  /**
   * @returns {bigint | undefined}
   */
  const getLastSeenNumber = () => lastSeenNumber;

  /**
   * @param {string} userContent
   * @returns {Promise<string>}
   */
  const processMessage = async userContent => {
    transcript.push({ role: 'user', content: userContent });

    const response = await ollama.chat({
      model: config.model || 'qwen3',
      messages: transcript,
    });

    const content = response.message?.content || '';
    transcript.push({ role: 'assistant', content });

    // Best-effort: extract fenced JS code blocks and propose via requestEvaluation
    const codeMatch = content.match(/```(?:js|javascript)?\n([\s\S]*?)```/);
    if (codeMatch) {
      try {
        const result = await E(powers).requestEvaluation(
          codeMatch[1],
          [],
          [],
          'last-result',
        );
        const responseText = `${content}\n\n[Evaluation result: ${result}]`;

        // Save conversation state after each complete exchange
        try {
          await saveConversation(powers, {
            messages: transcript,
            ...(lastSeenNumber !== undefined && { lastSeenNumber }),
          });
        } catch {
          // Best-effort persistence
        }

        return responseText;
      } catch (e) {
        return `${content}\n\n[Evaluation failed: ${/** @type {Error} */ (e).message}]`;
      }
    }

    // Save conversation state after each complete exchange
    try {
      await saveConversation(powers, {
        messages: transcript,
        ...(lastSeenNumber !== undefined && { lastSeenNumber }),
      });
    } catch {
      // Best-effort persistence
    }

    return content;
  };

  return harden({ processMessage, setLastSeenNumber, getLastSeenNumber });
};
harden(createOllamaBackend);
