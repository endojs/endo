/**
 * memory_search Tool
 *
 * Searches memory files using semantic search.
 * Security: Restrict to workspace paths only.
 */

import { M } from '@endo/patterns';

export const memorySearch = {
  schema: M.interface('memorySearch', {
    query: M.string(),
    limit: M.number().optional(),
  }),

  help: () => `
## memory_search

Searches memory files for relevant information.

**Parameters:**
- `query`: Search query (required)
- `limit`: Maximum number of results (optional, default: 5)

**Example:**
\`\`\`
memory_search({ query: "Prime preferences", limit: 3 })
\`\`\`
  `.trim(),

  async execute({ query, limit = 5 }) {
    // Security: Validate query
    if (!query || typeof query !== 'string') {
      throw new Error('query is required and must be a string');
    }

    // Security: Prevent code injection
    if (query.includes('<tool_output>') || query.includes('<memory_context>') || query.includes('<external_content>')) {
      throw new Error('Invalid query: forbidden content detected');
    }

    try {
      // Import memory system
      const { memorySearch } = await import('./memory-search-core.js');
      const results = await memorySearch({ query, limit });

      return {
        success: true,
        query,
        limit,
        results,
      };
    } catch (err) {
      throw new Error(`Memory search failed: ${err.message}`);
    }
  },
};
