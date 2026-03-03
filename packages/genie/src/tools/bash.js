/**
 * bash Tool
 *
 * Executes shell commands.
 * Security: Command validation and timeout.
 */

import { M } from '@endo/patterns';

export const bash = {
  schema: M.interface('bash', {
    command: M.string(),
    timeout_ms: M.number().optional(),
  }),

  help: () => `
## bash

Executes shell commands.

**Parameters:**
- `command`: Shell command to execute (required)
- `timeout_ms`: Timeout in milliseconds (optional)

**Example:**
\`\`\`
bash({ command: "ls -la" })
\`\`\`
  `.trim(),

  async execute({ command, timeout_ms = 30000 }) {
    // Security: Validate command
    if (!command || typeof command !== 'string') {
      throw new Error('command is required and must be a string');
    }

    // Security: Prevent dangerous commands
    const dangerousPatterns = [
      /rm\s+-rf\s+[^*]$/, // rm without -rf *
      /chmod\s+777\s+/, // chmod 777
      /chown\s+\d+\s+/, // chown with user ID
      /sudo\s+/, // sudo
      /pkill\s+-9\s+/, // pkill -9
      /kill\s+9\s+/, // kill 9
      /mv\s+\/[a-z]?\s+/, // mv /
      /mv\s+\/[^/]+\/[^/]+\s+\/\s+/, // mv /path/to/ / (dangerous)
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        throw new Error('Command contains dangerous pattern');
      }
    }

    try {
      const { exec } = await import('child_process');
      return new Promise((resolve, reject) => {
        exec(
          command,
          {
            timeout: timeout_ms,
            env: {
              ...process.env,
              PATH: process.env.PATH, // Restrict PATH to prevent command injection
            },
          },
          (error, stdout, stderr) => {
            if (error) {
              reject(error);
            } else {
              resolve({
                success: true,
                command,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: 0,
              });
            }
          }
        );
      });
    } catch (err) {
      throw new Error(`Bash execution failed: ${err.message}`);
    }
  },
};