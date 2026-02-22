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
 * @typedef {object} ToolSchema
 * @property {'function'} type
 * @property {ToolFunction} function
 */

/**
 * @typedef {object} FaeTool
 * @property {() => ToolSchema} schema
 * @property {(args: Record<string, unknown>) => Promise<string>} execute
 * @property {() => string} help
 */

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
 * @param {import('@endo/eventual-send').ERef<object>} host
 * @returns {FaeTool}
 */
export const makeEvaluateTool = host => {
  /** @type {ToolSchema} */
  const toolSchema = harden({
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
  });

  return harden({
    schema() {
      return toolSchema;
    },
    async execute(args) {
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
    },
    help() {
      return 'Evaluate JavaScript source code in an isolated Endo daemon worker.';
    },
  });
};
harden(makeEvaluateTool);

/**
 * @param {string} cwd
 * @returns {FaeTool}
 */
export const makeReadFileTool = cwd => {
  /** @type {ToolSchema} */
  const toolSchema = harden({
    type: 'function',
    function: {
      name: 'readFile',
      description:
        'Read the contents of a file. Path is relative to the working directory.',
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
  });

  return harden({
    schema() {
      return toolSchema;
    },
    async execute(args) {
      const { filePath } = /** @type {{ filePath: string }} */ (args);
      if (!filePath) {
        throw new Error('filePath is required');
      }
      const resolved = resolveSafe(filePath, cwd);
      const content = await fs.promises.readFile(resolved, 'utf-8');
      if (content.length > 50_000) {
        return `${content.slice(0, 50_000)}\n\n... (truncated, ${content.length} chars total)`;
      }
      return content;
    },
    help() {
      return 'Read the contents of a file relative to the working directory.';
    },
  });
};
harden(makeReadFileTool);

/**
 * @param {string} cwd
 * @returns {FaeTool}
 */
export const makeWriteFileTool = cwd => {
  /** @type {ToolSchema} */
  const toolSchema = harden({
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
  });

  return harden({
    schema() {
      return toolSchema;
    },
    async execute(args) {
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
    },
    help() {
      return 'Write contents to a file, creating it if it does not exist.';
    },
  });
};
harden(makeWriteFileTool);

/**
 * @param {string} cwd
 * @returns {FaeTool}
 */
export const makeEditFileTool = cwd => {
  /** @type {ToolSchema} */
  const toolSchema = harden({
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
  });

  return harden({
    schema() {
      return toolSchema;
    },
    async execute(args) {
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
    },
    help() {
      return 'Edit a file by replacing the first occurrence of a string with another.';
    },
  });
};
harden(makeEditFileTool);

/**
 * @param {string} cwd
 * @returns {FaeTool}
 */
export const makeListDirTool = cwd => {
  /** @type {ToolSchema} */
  const toolSchema = harden({
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
  });

  return harden({
    schema() {
      return toolSchema;
    },
    async execute(args) {
      const { dirPath = '.' } = /** @type {{ dirPath?: string }} */ (args);
      const resolved = resolveSafe(dirPath, cwd);
      const entries = await fs.promises.readdir(resolved, {
        withFileTypes: true,
      });
      const lines = entries.map(e => {
        const suffix = e.isDirectory() ? '/' : '';
        return `${e.name}${suffix}`;
      });
      return lines.join('\n');
    },
    help() {
      return 'List the contents of a directory relative to the working directory.';
    },
  });
};
harden(makeListDirTool);

/**
 * @param {string} cwd
 * @returns {FaeTool}
 */
export const makeRunCommandTool = cwd => {
  /** @type {ToolSchema} */
  const toolSchema = harden({
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
            description:
              'The shell command to execute (e.g., "npm test", "git status").',
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
  });

  return harden({
    schema() {
      return toolSchema;
    },
    async execute(args) {
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
          maxBuffer: 1024 * 1024,
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
    },
    help() {
      return 'Execute a shell command in the working directory.';
    },
  });
};
harden(makeRunCommandTool);

/**
 * @param {import('@endo/eventual-send').ERef<object>} host
 * @returns {FaeTool}
 */
export const makeListPetnamesTool = host => {
  /** @type {ToolSchema} */
  const toolSchema = harden({
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
  });

  return harden({
    schema() {
      return toolSchema;
    },
    async execute(_args) {
      const names = await E(host).list();
      return JSON.stringify(names, null, 2);
    },
    help() {
      return 'List all petnames in the Endo directory.';
    },
  });
};
harden(makeListPetnamesTool);

/**
 * @param {import('@endo/eventual-send').ERef<object>} host
 * @returns {FaeTool}
 */
export const makeLookupTool = host => {
  /** @type {ToolSchema} */
  const toolSchema = harden({
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
  });

  return harden({
    schema() {
      return toolSchema;
    },
    async execute(args) {
      const { petName } = /** @type {{ petName: string }} */ (args);
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
    },
    help() {
      return 'Look up a stored value by petname.';
    },
  });
};
harden(makeLookupTool);

/**
 * @param {import('@endo/eventual-send').ERef<object>} host
 * @returns {FaeTool}
 */
export const makeStoreTool = host => {
  /** @type {ToolSchema} */
  const toolSchema = harden({
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
  });

  return harden({
    schema() {
      return toolSchema;
    },
    async execute(args) {
      const { value, petName } =
        /** @type {{ value: unknown, petName: string }} */ (args);
      if (petName === undefined) {
        throw new Error('petName is required');
      }
      await E(host).storeValue(value, petName);
      return `Stored value under "${petName}"`;
    },
    help() {
      return 'Store a JSON-serializable value under a petname.';
    },
  });
};
harden(makeStoreTool);

/**
 * @param {import('@endo/eventual-send').ERef<object>} host
 * @returns {FaeTool}
 */
export const makeRemoveTool = host => {
  /** @type {ToolSchema} */
  const toolSchema = harden({
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
  });

  return harden({
    schema() {
      return toolSchema;
    },
    async execute(args) {
      const { petName } = /** @type {{ petName: string }} */ (args);
      if (!petName) {
        throw new Error('petName is required');
      }
      await E(host).remove(petName);
      return `Removed "${petName}"`;
    },
    help() {
      return 'Remove a petname from the Endo directory.';
    },
  });
};
harden(makeRemoveTool);

/**
 * Meta-tool for adopting a capability from a mail message as a tool.
 * Adopted capabilities are placed in the tools/ directory and become
 * immediately available.
 *
 * @param {import('@endo/eventual-send').ERef<object>} host
 * @returns {FaeTool}
 */
/**
 * @param {import('@endo/eventual-send').ERef<object>} powers
 * @returns {FaeTool}
 */
export const makeSendTool = powers => {
  /** @type {ToolSchema} */
  const toolSchema = harden({
    type: 'function',
    function: {
      name: 'send',
      description:
        'Send a message to another agent or the HOST. ' +
        'Strings are text content, edgeNames attach capabilities from your directory, ' +
        'petNames are the local names for those capabilities.',
      parameters: {
        type: 'object',
        properties: {
          recipient: {
            type: 'string',
            description:
              'Who to send to (e.g., "HOST", or a petname for an agent).',
          },
          strings: {
            type: 'array',
            items: { type: 'string' },
            description: 'Text parts of the message.',
          },
          edgeNames: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Labels for attached capabilities (as seen by the recipient).',
          },
          petNames: {
            type: 'array',
            items: { type: 'string' },
            description: 'Your local petnames for the capabilities to attach.',
          },
        },
        required: ['recipient', 'strings'],
      },
    },
  });

  return harden({
    schema() {
      return toolSchema;
    },
    async execute(args) {
      const {
        recipient,
        strings = [],
        edgeNames = [],
        petNames = [],
      } = /** @type {{ recipient: string, strings?: string[], edgeNames?: string[], petNames?: string[] }} */ (
        args
      );
      if (!recipient) {
        throw new Error('recipient is required');
      }
      await E(powers).send(recipient, strings, edgeNames, petNames);
      return `Sent message to "${recipient}"`;
    },
    help() {
      return 'Send a message to another agent or the HOST.';
    },
  });
};
harden(makeSendTool);

/**
 * @param {import('@endo/eventual-send').ERef<object>} powers
 * @returns {FaeTool}
 */
export const makeReplyTool = powers => {
  /** @type {ToolSchema} */
  const toolSchema = harden({
    type: 'function',
    function: {
      name: 'reply',
      description:
        'Reply to a specific message by number. The reply is automatically ' +
        'routed to the original sender — no need to know their pet name. ' +
        'Use this instead of send when responding to an incoming message.',
      parameters: {
        type: 'object',
        properties: {
          messageNumber: {
            type: 'integer',
            description: 'The message number to reply to.',
          },
          strings: {
            type: 'array',
            items: { type: 'string' },
            description: 'Text parts of the reply.',
          },
          edgeNames: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Labels for attached capabilities (as seen by the recipient).',
          },
          petNames: {
            type: 'array',
            items: { type: 'string' },
            description: 'Your local petnames for the capabilities to attach.',
          },
        },
        required: ['messageNumber', 'strings'],
      },
    },
  });

  return harden({
    schema() {
      return toolSchema;
    },
    async execute(args) {
      const {
        messageNumber,
        strings = [],
        edgeNames = [],
        petNames = [],
      } = /** @type {{ messageNumber: number, strings?: string[], edgeNames?: string[], petNames?: string[] }} */ (
        args
      );
      if (messageNumber === undefined) {
        throw new Error('messageNumber is required');
      }
      await E(powers).reply(
        BigInt(messageNumber),
        strings,
        edgeNames,
        petNames,
      );
      return `Replied to message #${messageNumber}`;
    },
    help() {
      return 'Reply to a message by number, automatically routing to the sender.';
    },
  });
};
harden(makeReplyTool);

/**
 * @param {import('@endo/eventual-send').ERef<object>} powers
 * @returns {FaeTool}
 */
export const makeListMessagesTool = powers => {
  /** @type {ToolSchema} */
  const toolSchema = harden({
    type: 'function',
    function: {
      name: 'listMessages',
      description:
        'List messages in your inbox. Returns an array of message summaries ' +
        'with number, from, and edge names.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  });

  return harden({
    schema() {
      return toolSchema;
    },
    async execute(_args) {
      return E(powers).listMessages();
    },
    help() {
      return 'List messages in your inbox.';
    },
  });
};
harden(makeListMessagesTool);

/**
 * @param {import('@endo/eventual-send').ERef<object>} powers
 * @returns {FaeTool}
 */
export const makeDismissTool = powers => {
  /** @type {ToolSchema} */
  const toolSchema = harden({
    type: 'function',
    function: {
      name: 'dismiss',
      description: 'Dismiss (acknowledge) a message from your inbox by number.',
      parameters: {
        type: 'object',
        properties: {
          messageNumber: {
            type: 'integer',
            description: 'The message number to dismiss (integer).',
          },
        },
        required: ['messageNumber'],
      },
    },
  });

  return harden({
    schema() {
      return toolSchema;
    },
    async execute(args) {
      const { messageNumber } = /** @type {{ messageNumber: number }} */ (args);
      if (messageNumber === undefined) {
        throw new Error('messageNumber is required');
      }
      await E(powers).dismiss(BigInt(messageNumber));
      return `Dismissed message #${messageNumber}`;
    },
    help() {
      return 'Dismiss a message from your inbox by number.';
    },
  });
};
harden(makeDismissTool);

/**
 * Meta-tool for adopting a capability from a mail message as a tool.
 * Adopted capabilities are placed in the tools/ directory and become
 * immediately available.
 *
 * @param {import('@endo/eventual-send').ERef<object>} host
 * @returns {FaeTool}
 */
export const makeAdoptToolTool = host => {
  /** @type {ToolSchema} */
  const toolSchema = harden({
    type: 'function',
    function: {
      name: 'adoptTool',
      description:
        'Adopt a capability from a mail message and install it as a tool. ' +
        'The adopted capability must implement the FaeTool interface (schema, execute, help). ' +
        'Once adopted, the tool is immediately available — use it right away.',
      parameters: {
        type: 'object',
        properties: {
          messageNumber: {
            type: 'integer',
            description:
              'The message number containing the tool capability (integer).',
          },
          edgeName: {
            type: 'string',
            description: 'The edge name (label) of the tool in the message.',
          },
          toolName: {
            type: 'string',
            description:
              'Name for the tool in the tools/ directory (e.g., "my-tool").',
          },
        },
        required: ['messageNumber', 'edgeName', 'toolName'],
      },
    },
  });

  return harden({
    schema() {
      return toolSchema;
    },
    async execute(args) {
      const { messageNumber, edgeName, toolName } =
        /** @type {{ messageNumber: number, edgeName: string, toolName: string }} */ (
          args
        );
      if (messageNumber === undefined || !edgeName || !toolName) {
        throw new Error('messageNumber, edgeName, and toolName are required');
      }
      await E(host).adopt(BigInt(messageNumber), edgeName, ['tools', toolName]);
      return `Adopted tool "${toolName}" from message #${messageNumber}. It is now available — use it immediately.`;
    },
    help() {
      return 'Adopt a capability from a mail message and install it as a tool.';
    },
  });
};
harden(makeAdoptToolTool);
