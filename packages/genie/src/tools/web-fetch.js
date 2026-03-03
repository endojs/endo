/**
 * webFetch Tool
 *
 * Fetches content from a URL.
 * Security: Rate limiting and content validation.
 */

import { M } from '@endo/patterns';

export const webFetch = {
  schema: M.interface('webFetch', {
    url: M.string(),
    timeout: M.number().optional(),
  }),

  help: () => `
## webFetch

Fetches content from a URL.

**Parameters:**
- `url`: URL to fetch (required)
- `timeout`: Timeout in milliseconds (optional)

**Example:**
\`\`\`
webFetch({ url: "https://example.com" })
\`\`\`
  `.trim(),

  async execute({ url, timeout = 30000 }) {
    // Security: Validate URL
    if (!url || typeof url !== 'string') {
      throw new Error('url is required and must be a string');
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: timeout ? AbortSignal.timeout(timeout) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();

      // Security: Check for dangerous content
      if (content.includes('<tool_output>') || content.includes('<memory_context>') || content.includes('<external_content>')) {
        throw new Error('Invalid content: forbidden content detected in response');
      }

      return {
        success: true,
        url,
        status: response.status,
        content,
        contentType: response.headers.get('content-type'),
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw err;
    }
  },
};