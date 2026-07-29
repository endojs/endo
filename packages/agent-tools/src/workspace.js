// @ts-check
/// <reference types="ses"/>

/** @import { ERef } from '@endo/eventual-send' */
/** @import { Filesystem } from '@endo/platform/fs/extended' */
/**
 * @import {
 *   ToolRecord,
 *   WorkspaceGrants,
 *   ProvisionWorkspaceGrants,
 *   HistoryToolsGrant,
 * } from './types.js'
 */

import { E } from '@endo/eventual-send';
import { mountAsFilesystem } from '@endo/platform/fs/extended';

import { makeGitTool } from './json-tools/git.js';
import { makeGitMountTools } from './json-tools/git-mount.js';
import { makeGitRemoteTool } from './json-tools/git-remote.js';
import { makeShellTool } from './json-tools/shell.js';
import { makeMountFsTools } from './json-tools/fs.js';

/**
 * Capability-based provisioning for one agent workspace: the thin adapter that
 * turns a set of already-granted daemon capabilities into the flat agent-tool
 * catalog a harness advertises to a model, replacing the path-root provisioning
 * sketch (`endo grant fae fs /home/user/project`, a git subprocess rooted at a
 * host path) with composition over the trio's capabilities.
 *
 * The composition realizes the two rules of daemon-agent-tools § Granting and
 * Provisioning:
 *
 * - **Conditional composition.** A tool group is present in the catalog only
 *   when the caller holds the backing capability; an ungranted group is
 *   *absent*, not present-but-failing. This maps one grant to one group:
 *   `filesystem` → the mount file tools, `git` → the versioning tools (the
 *   JSON-safe git slice plus the mount-bridged `status` / `add`), `remote` →
 *   the push tier, `shell` → the command tools.
 * - **Formula-owned identity rides the granted `Git`.** Commit attribution is
 *   captured at `provideGit` / `provideGitClone` construction time and is
 *   guest-immutable (daemon-agent-tools § Commit-identity boundary). This
 *   adapter never re-states or overrides it: threading the identity means
 *   composing tools *over the granted `Git`*, whose backend already projects
 *   the policy author/committer onto every mutating invocation. No identity
 *   argument crosses this seam.
 *
 * The catalog is a flat array with unique tool names, so a harness may index it
 * by name without ambiguity.
 */

/**
 * Concatenate tool-group record arrays into one catalog, failing closed if two
 * groups would emit the same tool name. A catalog with two identically-named
 * tools is ambiguous the moment a harness dispatches by name, so the collision
 * is an error at composition time rather than a silent shadow. (Known overlap:
 * both `makeShellTool` and `makeGitRemoteTool` emit a bounds-legibility
 * `inspect`; grant at most one of `shell` / `remote` to a single catalog until
 * that tool-layer naming is reconciled.)
 *
 * @param {{ group: string, records: ToolRecord[] }[]} groups
 * @returns {ToolRecord[]}
 */
const concatDistinctTools = groups => {
  /** @type {ToolRecord[]} */
  const catalog = [];
  /** @type {Map<string, string>} */
  const sourceByName = new Map();
  for (const { group, records } of groups) {
    for (const record of records) {
      const priorGroup = sourceByName.get(record.name);
      if (priorGroup !== undefined) {
        throw new Error(
          `agent-tool catalog name collision: "${record.name}" is emitted by both the "${priorGroup}" and "${group}" tool groups; grant only one to a single catalog, or disambiguate the tool names before composing`,
        );
      }
      sourceByName.set(record.name, group);
      catalog.push(record);
    }
  }
  return harden(catalog);
};

/**
 * Compose the agent-tool catalog from a set of already-held capabilities.
 *
 * Synchronous: every grant is composed by its own maker with no boundary
 * round-trip. Use {@link provisionWorkspaceTools} when the `Filesystem` view
 * should be derived from the granted `Git`'s worktree rather than passed in.
 *
 * @param {WorkspaceGrants} [grants]
 * @returns {ToolRecord[]}
 */
export const makeWorkspaceTools = ({
  filesystem,
  git,
  remote,
  shell,
  readOnly = false,
  maxChars,
  shellOptions,
} = {}) => {
  /** @type {{ group: string, records: ToolRecord[] }[]} */
  const groups = [];
  if (filesystem !== undefined) {
    groups.push({
      group: 'file',
      records: makeMountFsTools(filesystem, { readOnly, maxChars }),
    });
  }
  if (git !== undefined) {
    // The versioning layer: the JSON-safe git slice (commit / log / diff /
    // branch navigation) plus the mount-bridged `status` / `add`, both over
    // the same granted `Git` whose formula-owned identity attributes commits.
    groups.push({ group: 'git', records: makeGitTool(git) });
    groups.push({ group: 'gitMount', records: makeGitMountTools(git) });
  }
  if (remote !== undefined) {
    groups.push({ group: 'gitRemote', records: makeGitRemoteTool(remote) });
  }
  if (shell !== undefined) {
    groups.push({
      group: 'shell',
      records: makeShellTool(shell, shellOptions),
    });
  }
  return concatDistinctTools(groups);
};
harden(makeWorkspaceTools);

/**
 * Provision the catalog, deriving the content-layer `Filesystem` from the
 * granted `Git`'s own worktree mount when `filesystem` is not supplied.
 *
 * A single `Git` grant then yields both the editing surface (file tools) and
 * the versioning surface (git tools) over the same physical worktree: the mount
 * carries the worktree authority, and `mountAsFilesystem` projects the
 * `Filesystem` the file tools operate on. No host path crosses the boundary.
 *
 * @param {ProvisionWorkspaceGrants} [grants]
 * @returns {Promise<ToolRecord[]>}
 */
export const provisionWorkspaceTools = async ({
  git,
  remote,
  shell,
  filesystem,
  readOnly = false,
  maxChars,
  shellOptions,
} = {}) => {
  await null; // safe-await separator before any boundary round-trip
  let workspaceFilesystem = filesystem;
  if (workspaceFilesystem === undefined && git !== undefined) {
    const worktree = await E(git).worktree();
    workspaceFilesystem = mountAsFilesystem(worktree);
  }
  return makeWorkspaceTools({
    filesystem: workspaceFilesystem,
    git,
    remote,
    shell,
    readOnly,
    maxChars,
    shellOptions,
  });
};
harden(provisionWorkspaceTools);

/**
 * Read-only file tools over a git ref's snapshot. `Git.filesystemAt(ref)` lifts
 * any ref — `HEAD~1`, a branch tip, a pushed remote-tracking ref — into a
 * read-only `Filesystem`, and this composes the read / list / stat tools over
 * it. The agent "looks at" history as an ordinary filesystem and cannot mutate
 * through the view: the historical-read layer is never a worktree-mutation
 * path.
 *
 * @param {HistoryToolsGrant} grant
 * @returns {Promise<ToolRecord[]>}
 */
export const provisionHistoryTools = async ({ git, ref, maxChars }) => {
  await null; // safe-await separator before any boundary round-trip
  const filesystem = await E(git).filesystemAt(ref);
  return makeMountFsTools(/** @type {ERef<Filesystem>} */ (filesystem), {
    readOnly: true,
    maxChars,
  });
};
harden(provisionHistoryTools);
