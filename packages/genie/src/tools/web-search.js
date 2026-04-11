// @ts-check
/* global fetch */

/**
 * webSearch Tool
 *
 * Searches the web for current information.
 * Security: Rate limiting and query validation.
 */

import { M } from '@endo/patterns';

import { DOMParser } from '../dom-parser/index.js';
import { makeTool } from './common.js';

const forbiddenPatterns = harden([
  '<tool_output>',
  '<memory_context>',
  '<external_content>',
]);

export const webSearch = makeTool('webSearch', {
  *help() {
    yield 'Searches the web using a text query. Returns titles, URLs, and snippets.';
    yield '';
    yield 'Use webSearch to find information online. To download a specific URL, use webFetch.';
    yield '';
    yield '**Parameters:**';
    yield '- `query`: Search query text (required)';
    yield '- `count`: Number of results to return (optional, default: 5)';
    yield '';
    yield '**Example:**';
    yield '```';
    yield 'webSearch({ query: "JavaScript type checking best practices" })';
    yield '```';
  },

  schema: M.call(
    M.splitRecord({ query: M.string() }, { count: M.number() }),
  ).returns({
    success: M.boolean(),
    query: M.string(),
    count: M.number(),
    results: M.arrayOf(M.record()),
  }),

  /**
   * @param {object} options
   * @param {string} options.query
   * @param {number} [options.count]
   * @returns {Promise<{success: boolean, query: string, count: number, results: Array<{title: string, url: string, snippet: string}>}>}
   */
  async execute({ query, count = 5 }) {
    // Security: Prevent code injection
    for (const pattern of forbiddenPatterns) {
      if (query.includes(pattern)) {
        throw new Error('Invalid query: forbidden content detected');
      }
    }

    try {
      // Use DuckDuckGo HTML results API
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();

      // Parse HTML results (simple parser)
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const results = [];
      const links = doc.querySelectorAll('.result__a');
      const snippets = doc.querySelectorAll('.result__snippet');

      links.forEach((link, i) => {
        const snippetEl = snippets[i];
        if (link && snippetEl) {
          results.push({
            title: link.textContent.trim(),
            url: link.href,
            snippet: snippetEl.textContent.trim(),
          });
        }
      });

      return {
        success: true,
        query,
        count,
        results: results.slice(0, count),
      };
    } catch (err) {
      if (/** @type {Error} */ (err).name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw err;
    }
  },
});
harden(webSearch);
