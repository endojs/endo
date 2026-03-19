/**
 * Memory Search Core
 *
 * Core search functionality for memory files.
 * This uses simple substring search for now - can be upgraded to vector embeddings.
 */

import { M } from '@endo/patterns';

export async function memorySearch({ query, limit = 5 }) {
  // Security: Prevent path traversal in queries
  if (query.includes('..') || query.includes('/') || query.includes('\\')) {
    throw new Error('Invalid query: path traversal not allowed');
  }

  const fs = await import('fs/promises');
  const path = await import('path');

  const searchInFile = async (filePath) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      // Simple substring search
      const matches = [];
      const queryLower = query.toLowerCase();

      for (let i = 0; i < lines.length; i++) {
        const lineLower = lines[i].toLowerCase();
        if (lineLower.includes(queryLower)) {
          matches.push({
            file: path.basename(filePath),
            line: i + 1,
            content: lines[i].trim(),
          });
        }
      }

      return matches;
    } catch (err) {
      // Skip files that can't be read
      return [];
    }
  };

  // Search in MEMORY.md and memory/*.md
  const searchPaths = ['./MEMORY.md', './memory'];
  const results = [];

  for (const searchPath of searchPaths) {
    try {
      const stats = await fs.stat(searchPath);

      if (stats.isFile()) {
        results.push(...await searchInFile(searchPath));
      } else if (stats.isDirectory()) {
        // Search all .md files in directory
        const files = await fs.readdir(searchPath);
        for (const file of files) {
          if (file.endsWith('.md')) {
            results.push(...await searchInFile(path.join(searchPath, file)));
          }
        }
      }
    } catch (err) {
      // Skip non-existent paths
      continue;
    }
  }

  // Return top results
  return results.slice(0, limit);
}