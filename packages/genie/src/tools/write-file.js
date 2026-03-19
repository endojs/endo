/**
 * writeFile Tool
 *
 * Writes content to a file.
 * Security: Restrict to workspace paths only.
 */

import { M } from '@endo/patterns';

export const writeFile = {
  schema: M.interface('writeFile', {
    path: M.string(),
    content: M.string(),
  }),

  help: () => `
## writeFile

Writes content to a file.

**Parameters:**
- `path`: Path to file (required)
- `content`: Content to write (required)

**Example:**
\`\`\`
writeFile({ path: "test.txt", content: "Hello World" })
\`\`\`
  `.trim(),

  async execute({ path, content }) {
    // Security: Validate parameters
    if (!path || typeof path !== 'string') {
      throw new Error('path is required and must be a string');
    }
    if (content === undefined || content === null) {
      throw new Error('content is required');
    }
    if (typeof content !== 'string') {
      throw new Error('content must be a string');
    }

    // Security: Prevent directory traversal
    if (path.includes('..') || path.startsWith('/')) {
      throw new Error('Invalid path: directory traversal not allowed');
    }

    // Security: Prevent code injection
    if (content.includes('<tool_output>') || content.includes('<memory_context>') || content.includes('<external_content>')) {
      throw new Error('Invalid content: forbidden content detected');
    }

    const fs = await import('fs/promises');
    const fullPath = path.startsWith('/') ? path : `./${path}`;

    try {
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(fullPath, content, 'utf-8');

      return {
        success: true,
        path,
        bytesWritten: Buffer.byteLength(content, 'utf-8'),
      };
    } catch (err) {
      throw new Error(`Failed to write file: ${err.message}`);
    }
  },
};