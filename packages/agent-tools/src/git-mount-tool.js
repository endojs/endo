// @ts-check
/// <reference types="ses"/>

/** @import { ERef } from '@endo/eventual-send' */
/** @import { EndoMountEntry } from '@endo/exo-git' */
/** @import { GitMountToolCapability, ToolRecord } from './types.js' */

/**
 * The one worktree-mount method this bridge needs: `entry(segments)` mints the
 * `EndoMountEntry` remotable `Git.add` consumes. `@endo/exo-git` aliases
 * `EndoMount` to `unknown` to stay free of a circular `@endo/daemon` type
 * dependency (the full-fidelity `EndoMount` interface lives in `@endo/daemon`),
 * so we name the single method we reach through the mount locally rather than
 * importing that unreachable type.
 *
 * @typedef {object} WorktreeMount
 * @property {(segments: string[]) => EndoMountEntry} entry
 */

import { E } from '@endo/eventual-send';
import { M } from '@endo/patterns';

import { makeTool } from './tool.js';

/**
 * The git tools in this module bridge the two `EndoGit` methods whose native
 * signatures traffic in live capabilities — `status()` returns rows bearing
 * `EndoMountEntry` / node remotables, and `add()` takes an array of
 * `EndoMountEntry` remotables — so they cannot sit in the JSON-transparent,
 * one-to-one guard-mapped slice `makeGitTool` exposes. Each tool here holds the
 * mount/git capability pair (the mount reached through `Git.worktree()`) and
 * converts at the boundary: path strings in, JSON-safe records out. The
 * capability, never a path string, remains the confinement boundary — a `../`
 * segment is contained by the mount (clamped at the worktree root), not by a
 * brittle string check here.
 */

/** No-argument JSON Schema, shared by the read-only `status` tool. */
const NO_ARGS = harden({
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
});

/**
 * JSON Schema for `add`. The tool takes mount-relative path *strings*; the
 * maker resolves each to the `EndoMountEntry` remotable `Git.add` actually
 * wants. This is the deliberate wire↔cap divergence the mount bridge exists to
 * span, which is why `add` lives here and not in `makeGitTool`'s
 * divergence-gated slice.
 */
const addParameters = harden({
  type: 'object',
  properties: {
    paths: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Mount-relative paths to stage, each addressing a file (not the ' +
        'worktree root). Each is resolved through the worktree mount; a ' +
        '"../" segment is contained by the capability, clamped at the ' +
        'worktree root rather than escaping it.',
    },
  },
  required: ['paths'],
  additionalProperties: false,
});

/**
 * Split a mount-relative path string into entry segments, dropping empty and
 * `.` components so `a/b`, `a//b`, and `a/b/` resolve identically. A `..`
 * segment is preserved and contained by the mount capability (clamped at the
 * worktree root), not by a brittle string check here. A path built only from
 * dropped components (`.`, `/`, `//`, `./`) yields an empty segment list; the
 * caller rejects that so it never resolves to the worktree-root entry.
 *
 * @param {string} path
 * @returns {string[]}
 */
const pathToSegments = path =>
  path.split('/').filter(segment => segment !== '' && segment !== '.');

/**
 * Build the mount-bridged git tool records — `status` and `add` — for a live
 * `Git` capability. These complement `makeGitTool`'s JSON-transparent slice to
 * complete the daemon-agent-tools Phase 3 surface (status/diff/log/add/commit);
 * `diff`, `log`, and `commit` come from `makeGitTool`.
 *
 * @param {ERef<GitMountToolCapability>} gitCap A live `Git` capability. The
 *   worktree mount is reached through `E(gitCap).worktree()`; a writable Git
 *   yields the writable mount, a read-only Git a read-only view that fails
 *   `add` closed at the capability regardless.
 * @returns {ToolRecord[]}
 */
export const makeGitMountTools = gitCap => {
  const statusTool = makeTool({
    name: 'status',
    description:
      'Report the working-tree status as { path, index, worktree } rows, ' +
      'one per changed path (with renamedFrom when a rename is detected).',
    parameters: NO_ARGS,
    // No positional args, but declaring an (empty) guard array still makes
    // `makeTool` reject any stray argument key fail-closed.
    argGuards: harden([]),
    execute: async () => {
      const rows = await E(gitCap).status();
      // Each row carries authority-bearing `entry` / `node` remotables that
      // cannot cross the JSON tool wire; project to the JSON-safe status
      // fields the model reads.
      return harden(
        rows.map(row => {
          const { path, index, worktree, renamedFrom } = row;
          return {
            path,
            index,
            worktree,
            ...(renamedFrom !== undefined ? { renamedFrom } : {}),
          };
        }),
      );
    },
  });

  const addTool = makeTool({
    name: 'add',
    description:
      'Stage files for the next commit by mount-relative path. Staging is ' +
      'additive and never discards working-tree changes.',
    parameters: addParameters,
    argGuards: harden([M.arrayOf(M.string())]),
    execute: async args => {
      const { paths } = /** @type {{ paths: string[] }} */ (args);
      if (paths.length === 0) {
        throw new Error('add requires a non-empty array of paths');
      }
      // Normalize every path up front and reject any that addresses no file.
      // Beyond the empty string, a path built only from dropped components
      // (`.`, `/`, `//`, `./`) collapses to zero segments, which would resolve
      // to the worktree-ROOT entry and reach `Git.add` as an empty pathspec —
      // rejected by the backend only with an opaque low-level error. Reject it
      // here, at the tool, with a clear message. A leading `..` is deliberately
      // NOT rejected here: the mount contains it (clamped at the root).
      const segmentsByPath = paths.map(path => {
        if (path === '') {
          throw new Error('add paths must be non-empty strings');
        }
        const segments = pathToSegments(path);
        if (segments.length === 0) {
          throw new Error(
            'add paths must address a file, not the worktree root',
          );
        }
        return segments;
      });
      // Resolve each path to an `EndoMountEntry` minted by this Git's own
      // worktree mount, so `Git.add`'s lineage check accepts it. `callWhen`
      // does not deeply await array elements, so the entries must be settled
      // remotables — not promises — before the call.
      const mount = /** @type {WorktreeMount} */ (await E(gitCap).worktree());
      const entries = await Promise.all(
        segmentsByPath.map(segments => E(mount).entry(segments)),
      );
      await E(gitCap).add(harden(entries));
      return `Staged ${paths.length} path${paths.length === 1 ? '' : 's'}.`;
    },
  });

  return harden([statusTool, addTool]);
};
harden(makeGitMountTools);
