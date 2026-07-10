// @ts-check
// `@endo/jsonl-transcript` — the append-only, Pi-compatible JSONL projection of
// a Lal reply-chain transcript graph. See `docs/session-format.md` for the file
// format and `README.md` for orientation.

export {
  FORMAT_VERSION,
  isStandardRole,
  makeHeaderEntry,
  makeMessageEntry,
  makeCustomEntry,
  formatEntry,
  parseLine,
  parseEntries,
} from './src/entries.js';

export {
  slugSegment,
  sessionDirPath,
  sessionFileName,
  sessionFilePath,
} from './src/session-path.js';

export { makeSessionWriter } from './src/writer.js';

export { loadFromJsonl, assemblePath, readSessionFile } from './src/reader.js';

export {
  entryId,
  projectNode,
  topoOrder,
  projectGraph,
  loadTranscriptNodes,
} from './src/project.js';
