/**
 * git Tool
 *
 * Git operations for the workspace.
 * Security: Restrict to working directory only.
 */

import { M } from '@endo/patterns';

export const gitTool = {
  schema: M.interface('git', {
    command: M.string(),
    path: M.string().optional(),
  }),

  help: () => `
## git

Executes git commands.

**Parameters:**
- `command`: Git command to execute (required)
- `path`: Working directory (optional, default: current directory)

**Example:**
\`\`\`
git({ command: "status" })
\`\`\`
  `.trim(),

  async execute({ command, path = '.' }) {
    // Security: Validate command
    if (!command || typeof command !== 'string') {
      throw new Error('command is required and must be a string');
    }

    // Security: Prevent directory traversal
    if (path.includes('..') || path.startsWith('/')) {
      throw new Error('Invalid path: directory traversal not allowed');
    }

    try {
      const { exec } = await import('child_process');
      return new Promise((resolve, reject) => {
        exec(
          command,
          {
            cwd: path,
            env: {
              ...process.env,
              PATH: process.env.PATH,
            },
          },
          (error, stdout, stderr) => {
            if (error) {
              reject(error);
            } else {
              resolve({
                success: true,
                command,
                path,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: 0,
              });
            }
          }
        );
      });
    } catch (err) {
      throw new Error(`Git execution failed: ${err.message}`);
    }
  },
};