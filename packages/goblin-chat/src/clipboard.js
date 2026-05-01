// @ts-check
/* global process */

/**
 * Best-effort clipboard write for the goblin-chat TUI.
 *
 * The TUI has one consumer for this — the "Host a new chat" flow, which
 * stuffs the freshly minted sturdyref URI onto the clipboard so the
 * user can paste it to whoever they want to invite. A failure here is
 * never fatal; the URI is also rendered into the chat events stream so
 * the user can copy it manually if every clipboard provider is missing.
 *
 * Provider selection:
 *
 *   - macOS:   `pbcopy`
 *   - Windows: `clip`
 *   - Linux/BSD: try `wl-copy` (Wayland), then `xclip`, then `xsel`,
 *     in that order. The first one that exits 0 wins.
 *
 * We deliberately avoid pulling in a dependency for this — every
 * clipboard library on npm shells out to the same set of binaries, and
 * adding a transitive dep would bloat the package for one quality-of-life
 * feature.
 */

import { spawn } from 'node:child_process';

/**
 * Try a single command. Resolves to `{ ok: true }` if the child exited
 * with code 0, `{ ok: false, error }` otherwise (including the
 * spawn-failed-with-ENOENT case).
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} text
 * @returns {Promise<{ ok: true } | { ok: false, error: unknown }>}
 */
const tryCommand = (cmd, args, text) =>
  new Promise(resolve => {
    /** @type {import('node:child_process').ChildProcess} */
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
    } catch (err) {
      resolve({ ok: false, error: err });
      return;
    }
    let settled = false;
    const settle = (
      /** @type {{ ok: true } | { ok: false, error: unknown }} */ result,
    ) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.on('error', err => settle({ ok: false, error: err }));
    child.on('close', code => {
      if (code === 0) {
        settle({ ok: true });
      } else {
        settle({
          ok: false,
          error: Error(`${cmd} exited with code ${code ?? 'null'}`),
        });
      }
    });
    const stdin = child.stdin;
    if (!stdin) {
      settle({ ok: false, error: Error(`${cmd} has no stdin`) });
      return;
    }
    stdin.on('error', err => settle({ ok: false, error: err }));
    try {
      stdin.end(text, 'utf8');
    } catch (err) {
      settle({ ok: false, error: err });
    }
  });

/**
 * @returns {Array<[string, string[]]>}
 */
const platformCandidates = () => {
  if (process.platform === 'darwin') {
    return [['pbcopy', []]];
  }
  if (process.platform === 'win32') {
    return [['clip', []]];
  }
  // Linux / BSD: try Wayland first (the native clipboard on a Wayland
  // session), then X11. `xsel` last because some distros default to it
  // but most ship `xclip` instead.
  return [
    ['wl-copy', []],
    ['xclip', ['-selection', 'clipboard']],
    ['xsel', ['--clipboard', '--input']],
  ];
};

/**
 * Copy `text` to the system clipboard. The promise always resolves —
 * callers should branch on the returned `ok` flag. The first candidate
 * that succeeds wins; if none does, the last error is returned so the
 * caller can surface it (e.g. into a log panel).
 *
 * @param {string} text
 * @returns {Promise<{ ok: true } | { ok: false, error: unknown }>}
 */
export const copyToClipboard = async text => {
  // First-await-not-nested: required by `@jessie.js/safe-await-separator`
  // so the body of this async function reads as straight-line code from
  // the first suspension point onward.
  await null;
  const candidates = platformCandidates();
  /** @type {unknown} */
  let lastError = Error('no clipboard provider available');
  for (const [cmd, args] of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const result = await tryCommand(cmd, args, text);
    if (result.ok) return result;
    lastError = result.error;
  }
  return { ok: false, error: lastError };
};
