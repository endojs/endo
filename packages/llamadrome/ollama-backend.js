// @ts-check

/** @import { FarEndoGuest } from '@endo/daemon/src/types.js' */

import { E } from '@endo/eventual-send';
import { Ollama } from 'ollama';
import { getSystemPrompt } from './system-prompt.js';

/**
 * @typedef {{ processMessage: (userContent: string) => Promise<string> }} LLMBackend
 */

/**
 * Create an Ollama-based LLM backend.
 *
 * Manages a conversation transcript and sends messages to an Ollama instance.
 * Best-effort extraction of fenced code blocks triggers requestEvaluation.
 *
 * @param {FarEndoGuest} powers - Endo guest powers
 * @returns {LLMBackend}
 */
export const createOllamaBackend = powers => {
  const ollama = new Ollama({
    ...(process.env.OLLAMA_HOST && {
      host: process.env.OLLAMA_HOST,
    }),
    headers: {
      ...(process.env.OLLAMA_API_KEY && {
        Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`,
      }),
    },
  });

  const transcript = [
    { role: 'system', content: getSystemPrompt() },
  ];

  /**
   * @param {string} userContent
   * @returns {Promise<string>}
   */
  const processMessage = async userContent => {
    transcript.push({ role: 'user', content: userContent });

    const response = await ollama.chat({
      model: process.env.OLLAMA_MODEL || 'qwen3',
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
        return `${content}\n\n[Evaluation result: ${result}]`;
      } catch (e) {
        return `${content}\n\n[Evaluation failed: ${/** @type {Error} */ (e).message}]`;
      }
    }

    return content;
  };

  return harden({ processMessage });
};
harden(createOllamaBackend);
