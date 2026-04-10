// @ts-check

/**
 * FTS5 Search Backend
 *
 * SQLite FTS5-backed implementation of the `SearchBackend` interface.
 * Uses `better-sqlite3` for synchronous, in-process full-text search
 * with Porter stemming and BM25 ranking.
 *
 * Supports prefix queries, quoted phrases, and boolean operators
 * (AND, OR, NOT) via the FTS5 query syntax.
 */

/** @import { SearchBackend, SearchResult } from './memory.js' */

import Database from 'better-sqlite3';
import { join } from 'path';

/**
 * Create an FTS5-backed `SearchBackend`.
 *
 * The database file is stored at `<dbDir>/memory-fts.db`.  If `dbDir`
 * is omitted, the database is created in-memory (useful for tests).
 *
 * Each indexed document is split into individual lines so that search
 * results can report the matching line number and content — matching
 * the contract expected by `memorySearch`.
 *
 * @param {object} [options]
 * @param {string} [options.dbDir] - Directory for the SQLite database
 *   file.  When omitted, an in-memory database is used.
 * @returns {SearchBackend}
 */
const makeFTS5Backend = (options = {}) => {
  const { dbDir } = options;

  const dbPath = dbDir ? join(dbDir, 'memory-fts.db') : ':memory:';
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance.
  db.pragma('journal_mode = WAL');

  // Create the FTS5 virtual table with Porter stemming.
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      filename,
      line_number UNINDEXED,
      content,
      tokenize = 'porter unicode61'
    );
  `);

  // Prepared statements for hot paths.
  const insertStmt = db.prepare(
    `INSERT INTO memory_fts (filename, line_number, content)
     VALUES (?, ?, ?)`,
  );
  const deleteStmt = db.prepare(`DELETE FROM memory_fts WHERE filename = ?`);
  const distinctFilesStmt = db.prepare(
    `SELECT DISTINCT filename FROM memory_fts`,
  );
  const searchStmt = db.prepare(
    `SELECT filename, line_number, content, rank
     FROM memory_fts
     WHERE memory_fts MATCH ?
     ORDER BY rank
     LIMIT ?`,
  );

  /**
   * Re-index a document.  Removes any existing rows for `filename`
   * and inserts one row per line.
   *
   * @param {string} filename
   * @param {string} content
   */
  const indexDoc = db.transaction(
    (/** @type {string} */ filename, /** @type {string} */ content) => {
      deleteStmt.run(filename);
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (line.length > 0) {
          insertStmt.run(filename, i + 1, line);
        }
      }
    },
  );

  return harden({
    /**
     * Full-text search using FTS5 MATCH with BM25 ranking.
     *
     * The caller may use FTS5 query syntax directly — prefix queries
     * (`foo*`), quoted phrases (`"exact phrase"`), and boolean
     * operators (`AND`, `OR`, `NOT`) are all supported.
     *
     * If the query contains no FTS5 operators, each whitespace-
     * separated token is automatically turned into a prefix query
     * so that partial words still match.
     *
     * @param {string} query
     * @param {object} [opts]
     * @param {number} [opts.limit]
     * @returns {Promise<Array<SearchResult>>}
     */
    async search(query, opts = {}) {
      const { limit = 5 } = opts;
      const trimmed = query.trim();
      if (trimmed.length === 0) {
        return [];
      }

      // If the query looks like plain words (no FTS5 operators or
      // special syntax), convert each token into a prefix query so
      // that partial matches work naturally.
      const ftsOperators = /[":*(){}]/;
      const ftsKeywords = /\b(AND|OR|NOT|NEAR)\b/;
      const matchExpr =
        ftsOperators.test(trimmed) || ftsKeywords.test(trimmed)
          ? trimmed
          : trimmed
              .split(/\s+/)
              .map(tok => `${tok}*`)
              .join(' ');

      try {
        const rows =
          /** @type {Array<{filename: string, line_number: number, content: string}>} */ (
            searchStmt.all(matchExpr, limit)
          );

        return rows.map(row => ({
          file: row.filename,
          line: row.line_number,
          content: row.content,
        }));
      } catch {
        // If the FTS5 query syntax is invalid, fall back to quoting
        // the entire query as a phrase search.
        try {
          const escaped = `"${trimmed.replace(/\x22/g, '""')}"`;
          const rows =
            /** @type {Array<{filename: string, line_number: number, content: string}>} */ (
              searchStmt.all(escaped, limit)
            );
          return rows.map(row => ({
            file: row.filename,
            line: row.line_number,
            content: row.content,
          }));
        } catch {
          return [];
        }
      }
    },

    /**
     * Index (or re-index) the content of a memory file.
     *
     * @param {string} filename
     * @param {string} content
     */
    async index(filename, content) {
      indexDoc(filename, content);
    },

    /**
     * Remove all indexed rows for a given filename.
     *
     * @param {string} filename
     */
    async remove(filename) {
      deleteStmt.run(filename);
    },

    /**
     * Yield all distinct filenames currently stored in the FTS index.
     *
     * @returns {AsyncIterable<string>}
     */
    // eslint-disable-next-line require-yield
    async *indexedPaths() {
      const rows = /** @type {Array<{filename: string}>} */ (
        distinctFilesStmt.all()
      );
      for (const row of rows) {
        yield row.filename;
      }
    },

    /**
     * Flush any pending writes.  With WAL mode this is a checkpoint.
     */
    async sync() {
      db.pragma('wal_checkpoint(PASSIVE)');
    },
  });
};
harden(makeFTS5Backend);

export { makeFTS5Backend };
