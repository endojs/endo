/**
 * readFile Tool
 *
 * Reads file contents.
 * Security: Restrict to workspace paths only.
 */

import { M } from '@endo/patterns';

export const readFile = {
  schema: M.interface('readFile', {
    path: M.string(),
    offset: M.opt(M.number()),
    limit: M.opt(M.number()),
  }),

  help: () => `
## readFile

Reads file contents.

**Parameters:**
- \`path\`: Path to file (required)
- \`offset\`: Starting byte offset (optional)
- \`limit\`: Maximum bytes to read (optional)

**Example:**
\`\`\`
readFile({ path: "README.md", offset: 0, limit: 100 })
\`\`\`
  `.trim(),

  async execute({ path, offset = 0, limit }) {
    // Security: Validate path
    if (!path || typeof path !== 'string') {
      throw new Error('path is required and must be a string');
    }

    // Security: Prevent directory traversal
    if (path.includes('..') || path.startsWith('/')) {
      throw new Error('Invalid path: directory traversal not allowed');
    }

    const fs = await import('fs/promises');
    const fullPath = path.startsWith('/') ? path : `./${path}`;

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const bytes = Buffer.byteLength(content, 'utf-8');

      // Handle offset/limit
      if (offset > 0 || limit) {
        const start = offset;
        const end = limit ? offset + limit : bytes;
        if (start >= bytes) {
          throw new Error('Offset exceeds file size');
        }
        if (end > bytes) {
          throw new Error('Limit exceeds file size');
        }
        return {
          success: true,
          path,
          offset,
          limit,
          content: content.slice(offset, end),
          bytesRead: end - start,
        };
      }

      return {
        success: true,
        path,
        content,
        bytesRead: bytes,
      };
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`File not found: ${path}`);
      }
      throw err;
    }
  },
};
