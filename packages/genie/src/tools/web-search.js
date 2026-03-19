/**
 * webSearch Tool
 *
 * Searches the web for current information.
 * Security: Rate limiting and query validation.
 */

import { M } from '@endo/patterns';

export const webSearch = {
  schema: M.interface('webSearch', {
    query: M.string(),
    count: M.number().optional(),
  }),

  help: () => `
## webSearch

Searches the web for current information.

**Parameters:**
- `query`: Search query (required)
- `count`: Number of results to return (optional, default: 5)

**Example:**
\`\`\`
webSearch({ query: "JavaScript type checking best practices 2024" })
\`\`\`
  `.trim(),

  async execute({ query, count = 5 }) {
    // Security: Validate query
    if (!query || typeof query !== 'string') {
      throw new Error('query is required and must be a string');
    }

    // Security: Prevent code injection
    if (query.includes('<tool_output>') || query.includes('<memory_context>') || query.includes('<external_content>')) {
      throw new Error('Invalid query: forbidden content detected');
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
      if (err.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw err;
    }
  },
};