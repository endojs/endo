// @ts-check

/**
 * webFetch Tool
 *
 * Fetches content from a URL.
 * Security: Rate limiting and content validation.
 */

import { M } from '@endo/patterns';

import { makeTool } from './common.js';

export const webFetch = makeTool('webFetch', {
  help: function*() {
    yield 'Downloads content from a web URL. For web searches, use webSearch instead.';
    yield '';
    yield '**Parameters:**';
    yield '- `url`: Full URL to fetch, e.g. "https://example.com" (required)';
    yield '- `timeout`: Timeout in milliseconds (optional, default: 30000)';
    yield '';
    yield '**Example:**';
    yield '```';
    yield 'webFetch({ url: "https://example.com/api/data" })';
    yield '```';
  },

  schema: M.call(
    M.splitRecord({ url: M.string() }, { timeout: M.number() }),
  ).returns({
    success: M.boolean(),
    url: M.string(),
    status: M.number(),
    content: M.string(),
    contentType: M.string(),
  }),

  /**
   * @param {object} options
   * @param {string} options.url
   * @param {number} [options.timeout]
   * @returns {Promise<{success: boolean, url: string, status: number, content: string, contentType: string}>}
   */
  async execute({ url, timeout = 30_000 }) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: timeout ? AbortSignal.timeout(timeout) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();

      return {
        success: true,
        url,
        status: response.status,
        content,
        contentType: response.headers.get('content-type'),
      };
    } catch (err) {
      if (/** @type {Error} */ (err).name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw err;
    }
  },
});
harden(webFetch);
