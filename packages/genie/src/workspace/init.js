// @ts-check

/**
 * Workspace initialisation — copies the workspace template into a new
 * agent workspace on first spawn.
 *
 * The template lives at `packages/genie/workspace_template/` and
 * contains seed files for memory (`memory/observations.md`,
 * `memory/reflections.md`, `memory/profile.md`), `HEARTBEAT.md`, and
 * `SOUL.md`.  Files that already exist in the target workspace are
 * never overwritten so user customisations survive daemon restarts.
 */

import { constants, promises as fs } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import harden from '@endo/harden';

/** @import { Dirent } from 'fs' */

const moduleDirname = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to the workspace template shipped with the package.
 */
const TEMPLATE_DIR = resolve(moduleDirname, '..', '..', 'workspace_template');

/**
 * Recursively copy every file from `src` into `dest`, skipping files
 * that already exist in `dest`.
 *
 * @param {string} src - Source directory (template).
 * @param {string} dest - Destination directory (agent workspace).
 */
const copyTreeIfMissing = async (src, dest) => {
  await fs.mkdir(dest, { recursive: true });

  /** @type {Dirent[]} */
  let entries;
  try {
    entries = await fs.readdir(src, { withFileTypes: true });
  } catch {
    // Template directory missing — nothing to seed.
    return;
  }

  for await (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyTreeIfMissing(srcPath, destPath);
    } else {
      try {
        // COPYFILE_EXCL: fail if destPath already exists.
        await fs.copyFile(srcPath, destPath, constants.COPYFILE_EXCL);
      } catch (err) {
        // EEXIST means the user (or a prior run) already has this file.
        if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'EEXIST') {
          throw err;
        }
      }
    }
  }
};

/**
 * Sentinel file written after successful initialisation so we skip the
 * copy on subsequent launches.
 */
const INIT_MARKER = '.genie-workspace-init';

/**
 * Initialise an agent workspace from the shipped template.
 *
 * Copies seed files (memory templates, HEARTBEAT.md, SOUL.md) into
 * `workspaceDir` if they do not already exist.  Writes a small marker
 * file (`.genie-workspace-init`) so the copy is only attempted once.
 *
 * @param {string} workspaceDir - The agent's workspace directory.
 * @returns {Promise<boolean>} `true` if initialisation ran, `false` if
 *   the workspace was already initialised.
 */
export const initWorkspace = async workspaceDir => {
  await Promise.resolve();

  const markerPath = join(workspaceDir, INIT_MARKER);

  try {
    await fs.access(markerPath);
    // Marker exists — workspace already seeded.
    return false;
  } catch {
    // Marker absent — proceed with initialisation.
  }

  await copyTreeIfMissing(TEMPLATE_DIR, workspaceDir);

  // Write the marker so we don't re-run.
  await fs.writeFile(
    markerPath,
    `# Genie workspace initialised ${new Date().toISOString()}\n`,
  );

  return true;
};
harden(initWorkspace);

/**
 * Returns true if `workspaceDir` is a valid agent workspace,
 * by checking for the small marker file left by `initWorkspace`.
 *
 * @param {string} workspaceDir - The agent's workspace directory.
 * @returns {Promise<boolean>}
 */
export const isWorkspace = async workspaceDir => {
  await Promise.resolve();

  const markerPath = join(workspaceDir, INIT_MARKER);
  try {
    await fs.access(markerPath);
    return true;
  } catch {
    return false;
  }
};
harden(isWorkspace);
