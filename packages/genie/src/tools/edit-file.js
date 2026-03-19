/**
 * editFile Tool
 *
 * Edits a file by replacing old string with new string.
 * Security: Restrict to workspace paths only.
 */

import { M } from '@endo/patterns';

export const editFile = {
  schema: M.interface('editFile', {
    path: M.string(),
    old_string: M.string(),
    new_string: M.string(),
    replace_all: M.boolean().optional(),
  }),

  help: () => `
## editFile

Edits a file by replacing old string with new string.

**Parameters:**
- `path`: Path to file (required)
- `old_string`: String to replace (required)
- `new_string`: Replacement string (required)
- `replace_all`: Replace all occurrences (optional, default: false)

**Example:**
\`\`\`
editFile({ path: "README.md", old_string: "old", new_string: "new" })
\`\`\`
  `.trim(),

  async execute({ path, old_string, new_string, replace_all = false }) {
    // Security: Validate parameters
    if (!path || typeof path !== 'string') {
      throw new Error('path is required and must be a string');
    }
    if (old_string === undefined || old_string === null) {
      throw new Error('old_string is required');
    }
    if (new_string === undefined || new_string === null) {
      throw new Error('new_string is required');
    }
    if (typeof old_string !== 'string' || typeof new_string !== 'string') {
      throw new Error('old_string and new_string must be strings');
    }

    // Security: Prevent directory traversal
    if (path.includes('..') || path.startsWith('/')) {
      throw new Error('Invalid path: directory traversal not allowed');
    }

    // Security: Prevent code injection in strings
    if (old_string.includes('<tool_output>') || old_string.includes('<memory_context>') || old_string.includes('<external_content>')) {
      throw new Error('Invalid old_string: forbidden content detected');
    }
    if (new_string.includes('<tool_output>') || new_string.includes('<memory_context>') || new_string.includes('<external_content>')) {
      throw new Error('Invalid new_string: forbidden content detected');
    }

    const fs = await import('fs/promises');
    const fullPath = path.startsWith('/') ? path : `./${path}`;

    try {
      // Read file
      const content = await fs.readFile(fullPath, 'utf-8');

      // Perform replacement
      const before = content;
      if (replace_all) {
        content.replace(old_string, new_string);
      } else {
        const index = content.indexOf(old_string);
        if (index === -1) {
          throw new Error(`old_string not found in file`);
        }
        content.substring(0, index) + new_string + content.substring(index + old_string.length);
      }

      // Write back
      await fs.writeFile(fullPath, content, 'utf-8');

      const replaced = content !== before;
      const count = content.split(new_string).length - 1;

      return {
        success: true,
        path,
        replaced,
        count,
      };
    } catch (err) {
      throw new Error(`Failed to edit file: ${err.message}`);
    }
  },
};