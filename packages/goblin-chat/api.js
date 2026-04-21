// @ts-check

/**
 * `@endo/goblin-chat` — JavaScript port of Spritely's `(goblin-chat
 * backend)` plus an Ink-based TUI client. The backend is interoperable
 * with Goblins peers (per the bit-for-bit notes in `src/backend.js`);
 * the TUI under `bin/goblin-chat.js` connects to a chatroom from a
 * pasted sturdyref URI.
 *
 * This module re-exports the protocol surface so other consumers
 * (e.g. interop tests, alternative front-ends) can build on top of
 * the same chat backend without reaching into the package's `src/`
 * paths directly.
 */

export { makeChatroom, makeUserControllerPair } from './src/backend.js';
export { parseOcapnUri } from './src/uri-parse.js';
