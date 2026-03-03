/**
 * memory_get Tool
 *
 * Fetches specific lines from memory files.
 * Security: Restrict to workspace paths only.
 */

import { M } from '@endo/patterns';

export const memoryGet = {
  schema: M.interface('memoryGet', {
    path: M.string(),
    from: M.number().optional(),
    lines: M.number().optional(),
  }),

  help: () => `
## memory_get

Fetches specific lines from a memory file.

**Parameters:**
- `path`: Path to memory file (required)
- `from`: Starting line number (optional, default: 1)
- `lines`: Number of lines to fetch (optional)

**Example:**
\`\`\`
memory_get({ path: "MEMORY.md", from: 1, lines: 20 })
\`\`\`
  `.trim(),

  async execute({ path, from = 1, lines }) {
    // Security: Validate path
    if (!path || typeof path !== 'string') {
      throw new Error('path is required and must be a string');
    }

    // Security: Prevent directory traversal
    if (path.includes('..') || path.startsWith('/')) {
      throw new Error('Invalid path: directory traversal not allowed');
    }

    // Build full path
    const fullPath = path.startsWith('/') ? path : `./${path}`;

    try {
      // Read file
      const fs = await import('fs/promises');
      const content = await fs.readFile(fullPath, 'utf-8');
      const linesArr = content.split('\n');

      // Calculate range
      const fromLine = from - 1; // Convert to 0-index
      const toLine = lines ? fromLine + lines : linesArr.length;

      // Validate range
      if (fromLine < 0 || fromLine >= linesArr.length || toLine > linesArr.length) {
        throw new Error(`Invalid range: from=${from}, lines=${lines}, total=${linesArr.length}`);
      }

      // Extract lines
      const result = linesArr.slice(fromLine, toLine).join('\n');

      return {
        success: true,
        path,
        from,
        lines,
        content: result,
      };
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`File not found: ${path}`);
      }
      throw err;
    }
  },
};