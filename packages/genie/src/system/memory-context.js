/**
 * Memory Context Builder
 *
 * Injects memory content into system prompts.
 */

export async function buildMemoryContext({ memoryPath, limit = 1000 }) {
  const { readFile, memorySearch } = await import('./tools/index.js');

  try {
    // Try to read MEMORY.md
    const memoryResult = await readFile({ path: 'MEMORY.md' });

    if (memoryResult.success) {
      return `\n## Memory

${memoryResult.content.substring(0, limit)}...`;
    }

    // Try to search in memory directory
    const searchResult = await memorySearch({ query: '', count: 10 });

    if (searchResult.success && searchResult.results.length > 0) {
      const context = searchResult.results
        .map((r) => `- ${r.snippet}`)
        .join('\n');

      return `\n## Memory Context

${context}`;
    }

    return '';
  } catch (err) {
    // If memory reading fails, return empty context
    return '';
  }
}