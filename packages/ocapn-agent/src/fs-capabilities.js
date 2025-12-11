/* eslint-disable no-undef */
import fs from 'fs/promises';
import path from 'path';
import { AgentCapability } from './agent-capability.js';

/**
 * Create a file system capability for listing files in a directory.
 *
 * @param {string} baseDir - The base directory to restrict operations to
 * @returns {AgentCapability} The listFiles capability
 */
export const createListFilesCapability = (baseDir = process.cwd()) => {
  const listFiles = async (dirPath = '.') => {
    // Resolve the path relative to baseDir
    const resolvedPath = path.resolve(baseDir, dirPath);

    // Security check: ensure we don't escape baseDir
    if (!resolvedPath.startsWith(baseDir)) {
      throw new Error('Access denied: path outside base directory');
    }

    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

    try {
      return entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: path.relative(baseDir, path.join(resolvedPath, entry.name)),
      }));
    } catch (error) {
      throw new Error(`Failed to list files in ${dirPath}: ${error.message}`);
    }
  };

  return new AgentCapability({
    name: 'listFiles',
    value: listFiles,
    description:
      'Lists files and directories. Call with a relative path (e.g., "." for current directory, "src" for src directory)',
    typeInfo: {
      signature: '(dirPath?: string) => Promise<Array<{name: string, type: "file" | "directory", path: string}>>',
      params: {
        dirPath:
          'Optional relative path to directory (default: "." for current directory)',
      },
      returns:
        'Promise resolving to array of file/directory objects with name, type, and relative path',
    },
  });
};

/**
 * Create a file system capability for reading file contents.
 *
 * @param {string} baseDir - The base directory to restrict operations to
 * @returns {AgentCapability} The readFile capability
 */
export const createReadFileCapability = (baseDir = process.cwd()) => {
  const readFile = async (filePath, encoding = 'utf8') => {
    // Resolve the path relative to baseDir
    const resolvedPath = path.resolve(baseDir, filePath);

    // Security check: ensure we don't escape baseDir
    if (!resolvedPath.startsWith(baseDir)) {
      throw new Error('Access denied: path outside base directory');
    }

    const stats = await fs.stat(resolvedPath);

    try {
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`);
      }

      // @ts-expect-error - encoding type compatibility
      const content = await fs.readFile(resolvedPath, encoding);
      return content;
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  };

  return new AgentCapability({
    name: 'readFile',
    value: readFile,
    description:
      'Reads the contents of a file. Call with a relative file path and optional encoding (default: utf8)',
    typeInfo: {
      signature: '(filePath: string, encoding?: string) => Promise<string>',
      params: {
        filePath: 'Relative path to the file to read',
        encoding: 'Optional character encoding (default: "utf8")',
      },
      returns: 'Promise resolving to the file contents as a string',
    },
  });
};

/**
 * Create both file system capabilities.
 *
 * @param {string} baseDir - The base directory to restrict operations to
 * @returns {Array<AgentCapability>} Array containing listFiles and readFile capabilities
 */
export const createFileSystemCapabilities = (baseDir = process.cwd()) => {
  return [
    createListFilesCapability(baseDir),
    createReadFileCapability(baseDir),
  ];
};
