// @ts-check
/* global harden */

import fs from 'fs';
import path from 'path';

import { E } from '@endo/eventual-send';

/**
 * @typedef {object} ToolFunction
 * @property {string} name
 * @property {string} description
 * @property {object} parameters
 */

/**
 * @typedef {object} Tool
 * @property {'function'} type
 * @property {ToolFunction} function
 */

/**
 * @typedef {Record<string, unknown>} ToolCallArgs
 */

/** @type {Tool[]} */
const tools = [
  {
    type: 'function',
    function: {
      name: 'evaluate',
      description:
        'Evaluate JavaScript source code in an isolated Endo daemon worker. ' +
        'The code runs in a SES Compartment with E(), M, and makeExo as globals. ' +
        'Use endowments to pass named capabilities from the petname store into scope. ' +
        'Use resultName to store the result under a petname for later lookup.',
      parameters: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description: 'JavaScript source code to evaluate.',
          },
          endowments: {
            type: 'object',
            description:
              'Map of variable names to petnames. Each key becomes a variable ' +
              'in the evaluated code, bound to the capability stored under the petname value. ' +
              'Example: { "counter": "my-counter" } makes the capability named "my-counter" ' +
              'available as the variable `counter` in the source code.',
            additionalProperties: { type: 'string' },
          },
          resultName: {
            type: 'string',
            description:
              'Petname to store the evaluation result under. ' +
              'If provided, the result can be retrieved later via lookup.',
          },
          workerName: {
            type: 'string',
            description:
              'Name of the worker to evaluate in. Defaults to "MAIN". ' +
              'Use provideWorker first if you need a separate worker.',
          },
        },
        required: ['source'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'readFile',
      description: 'Read the contents of a file. Path is relative to the working directory.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Relative path to the file to read.',
          },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'writeFile',
      description:
        'Write contents to a file, creating it if it does not exist. ' +
        'Path is relative to the working directory.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Relative path to the file to write.',
          },
          contents: {
            type: 'string',
            description: 'The full contents to write to the file.',
          },
        },
        required: ['filePath', 'contents'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'editFile',
      description:
        'Edit a file by replacing the first occurrence of a string with another. ' +
        'Path is relative to the working directory.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Relative path to the file to edit.',
          },
          oldString: {
            type: 'string',
            description: 'The exact string to search for and replace.',
          },
          newString: {
            type: 'string',
            description: 'The replacement string.',
          },
        },
        required: ['filePath', 'oldString', 'newString'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listDir',
      description:
        'List the contents of a directory. Path is relative to the working directory. ' +
        'Omit path to list the working directory itself.',
      parameters: {
        type: 'object',
        properties: {
          dirPath: {
            type: 'string',
            description:
              'Relative path to the directory. Defaults to "." (working directory).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list',
      description:
        'List petnames in the Endo directory. Returns an array of stored capability names.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lookup',
      description:
        'Look up a stored value by petname. Returns the value stored under that name.',
      parameters: {
        type: 'object',
        properties: {
          petName: {
            type: 'string',
            description: 'The petname to look up.',
          },
        },
        required: ['petName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'store',
      description:
        'Store a JSON-serializable value under a petname. ' +
        'The value is persisted in the Endo daemon and can be retrieved with lookup.',
      parameters: {
        type: 'object',
        properties: {
          value: {
            description: 'The value to store (must be JSON-serializable).',
          },
          petName: {
            type: 'string',
            description: 'The petname to store the value under.',
          },
        },
        required: ['value', 'petName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove',
      description: 'Remove a petname from the Endo directory.',
      parameters: {
        type: 'object',
        properties: {
          petName: {
            type: 'string',
            description: 'The petname to remove.',
          },
        },
        required: ['petName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'runCommand',
      description:
        'Execute a shell command in the working directory. ' +
        'Returns stdout on success. Use for running npm scripts, git commands, ' +
        'linters, tests, and other CLI tools. Commands are run with a timeout.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute (e.g., "npm test", "git status").',
          },
          timeout: {
            type: 'number',
            description:
              'Maximum execution time in milliseconds. Defaults to 30000 (30 seconds).',
          },
        },
        required: ['command'],
      },
    },
  },
];
harden(tools);

/**
 * Resolve a relative path against the working directory and ensure it
 * does not escape above cwd.
 *
 * @param {string} relativePath
 * @param {string} cwd
 * @returns {string}
 */
const resolveSafe = (relativePath, cwd) => {
  const resolved = path.resolve(cwd, relativePath);
  if (!resolved.startsWith(cwd)) {
    throw new Error(`Path traversal not allowed: ${relativePath}`);
  }
  return resolved;
};

/**
 * Get the tool schemas for the LLM.
 *
 * @returns {Tool[]}
 */
export const getToolSchemas = () => tools;
harden(getToolSchemas);

/**
 * Execute a tool call.
 *
 * @param {string} name - Tool name
 * @param {ToolCallArgs} args - Tool arguments
 * @param {import('@endo/eventual-send').ERef<object>} host - Endo host reference
 * @param {string} cwd - Current working directory for filesystem operations
 * @returns {Promise<string>} Stringified result
 */
export const executeTool = async (name, args, host, cwd) => {
  switch (name) {
    case 'evaluate': {
      const {
        source,
        endowments = {},
        resultName,
        workerName = 'MAIN',
      } = /** @type {{ source: string, endowments?: Record<string, string>, resultName?: string, workerName?: string }} */ (
        args
      );
      if (!source) {
        throw new Error('source is required');
      }
      const codeNames = Object.keys(
        /** @type {Record<string, string>} */ (endowments),
      );
      const petNames = Object.values(
        /** @type {Record<string, string>} */ (endowments),
      );
      const resultPath = resultName ? [resultName] : undefined;
      const result = await E(host).evaluate(
        workerName,
        source,
        codeNames,
        petNames,
        resultPath,
      );
      if (result === undefined) {
        return 'undefined';
      }
      try {
        return JSON.stringify(result, null, 2);
      } catch {
        return String(result);
      }
    }

    case 'readFile': {
      const { filePath } =
        /** @type {{ filePath: string }} */ (args);
      if (!filePath) {
        throw new Error('filePath is required');
      }
      const resolved = resolveSafe(filePath, cwd);
      const content = await fs.promises.readFile(resolved, 'utf-8');
      if (content.length > 50_000) {
        return `${content.slice(0, 50_000)}\n\n... (truncated, ${content.length} chars total)`;
      }
      return content;
    }

    case 'writeFile': {
      const { filePath, contents } =
        /** @type {{ filePath: string, contents: string }} */ (args);
      if (!filePath || contents === undefined) {
        throw new Error('filePath and contents are required');
      }
      const resolved = resolveSafe(filePath, cwd);
      const dir = path.dirname(resolved);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(resolved, contents, 'utf-8');
      return `Wrote ${contents.length} chars to ${filePath}`;
    }

    case 'editFile': {
      const { filePath, oldString, newString } =
        /** @type {{ filePath: string, oldString: string, newString: string }} */ (
          args
        );
      if (!filePath || oldString === undefined || newString === undefined) {
        throw new Error('filePath, oldString, and newString are required');
      }
      const resolved = resolveSafe(filePath, cwd);
      const content = await fs.promises.readFile(resolved, 'utf-8');
      if (!content.includes(oldString)) {
        throw new Error(
          `oldString not found in ${filePath}. Ensure the string matches exactly.`,
        );
      }
      const updated = content.replace(oldString, newString);
      await fs.promises.writeFile(resolved, updated, 'utf-8');
      return `Edited ${filePath}`;
    }

    case 'listDir': {
      const { dirPath = '.' } =
        /** @type {{ dirPath?: string }} */ (args);
      const resolved = resolveSafe(dirPath, cwd);
      const entries = await fs.promises.readdir(resolved, {
        withFileTypes: true,
      });
      const lines = entries.map(e => {
        const suffix = e.isDirectory() ? '/' : '';
        return `${e.name}${suffix}`;
      });
      return lines.join('\n');
    }

    case 'list': {
      const names = await E(host).list();
      return JSON.stringify(names, null, 2);
    }

    case 'lookup': {
      const { petName } =
        /** @type {{ petName: string }} */ (args);
      if (!petName) {
        throw new Error('petName is required');
      }
      const value = await E(host).lookup([petName]);
      if (value === undefined) {
        return 'undefined';
      }
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }

    case 'store': {
      const { value, petName } =
        /** @type {{ value: unknown, petName: string }} */ (args);
      if (petName === undefined) {
        throw new Error('petName is required');
      }
      await E(host).storeValue(value, petName);
      return `Stored value under "${petName}"`;
    }

    case 'remove': {
      const { petName } =
        /** @type {{ petName: string }} */ (args);
      if (!petName) {
        throw new Error('petName is required');
      }
      await E(host).remove(petName);
      return `Removed "${petName}"`;
    }

    case 'runCommand': {
      const { command, timeout = 30_000 } =
        /** @type {{ command: string, timeout?: number }} */ (args);
      if (!command) {
        throw new Error('command is required');
      }
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd,
          timeout,
          maxBuffer: 1024 * 1024, // 1MB
        });
        const output = stdout + (stderr ? `\n[stderr]:\n${stderr}` : '');
        if (output.length > 50_000) {
          return `${output.slice(0, 50_000)}\n\n... (truncated, ${output.length} chars total)`;
        }
        return output || '(no output)';
      } catch (err) {
        const error =
          /** @type {Error & { stdout?: string, stderr?: string, code?: number }} */ (
            err
          );
        throw new Error(
          `Command failed (exit ${error.code ?? 'unknown'}):\n${error.stderr || error.message}`,
        );
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
};
harden(executeTool);
