// @ts-check

/**
 * Map file extensions to Monaco language identifiers.
 *
 * @param {string} filename
 * @returns {string}
 */
export const inferLanguage = filename => {
  const ext = filename.includes('.')
    ? filename.slice(filename.lastIndexOf('.')).toLowerCase()
    : '';
  /** @type {Record<string, string>} */
  const map = {
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.json': 'json',
    '.md': 'markdown',
    '.markdown': 'markdown',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.less': 'less',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.c': 'cpp',
    '.cpp': 'cpp',
    '.h': 'cpp',
    '.sh': 'shell',
    '.bash': 'shell',
    '.sql': 'sql',
    '.graphql': 'graphql',
    '.toml': 'ini',
    '.ini': 'ini',
    '.dockerfile': 'dockerfile',
  };
  if (filename.toLowerCase() === 'dockerfile') return 'dockerfile';
  if (filename.toLowerCase() === 'makefile') return 'shell';
  return map[ext] || 'plaintext';
};
