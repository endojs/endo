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
 *
 * Two front doors:
 *
 *   - {@link initWorkspaceMount} / {@link isWorkspaceMount} drive an
 *     Endo `Mount` capability via `E(mount).has` / `writeText`, so the
 *     daemon-hosted genie seeds the agent workspace through the same
 *     cap surface that `spawnAgent` binds into the slice.  The seed
 *     bytes are still read from the host filesystem (the genie
 *     unconfined caplet has unrestricted host fs access during boot
 *     and the `workspace_template/` files ship inside the package);
 *     only the destination side rides the cap.
 *   - {@link initWorkspace} / {@link isWorkspace} keep the original
 *     host-path signature for `dev-repl.js`, which has no daemon and
 *     no Mount cap.
 */

import { constants, promises as fs } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { E } from '@endo/eventual-send';
import harden from '@endo/harden';

/** @import { Dirent } from 'fs' */
/** @import { ERef } from '@endo/eventual-send' */

/**
 * Subset of the Endo `MountInterface` surface that this module drives.
 * Kept as a structural type so unit tests can pass a plain in-memory
 * fake without spinning up a daemon.  See
 * `packages/daemon/src/interfaces.js` `MountInterface` for the full
 * contract.
 *
 * @typedef {ERef<{
 *   has(...segments: string[]): Promise<boolean>;
 *   writeText(path: string | string[], content: string): Promise<void>;
 *   makeDirectory(path: string | string[]): Promise<void>;
 * }>} WorkspaceMountCap
 */

const moduleDirname = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to the workspace template shipped with the package.
 */
const TEMPLATE_DIR = resolve(moduleDirname, '..', '..', 'workspace_template');

/**
 * Sentinel file written after successful initialisation so we skip the
 * copy on subsequent launches.
 */
const INIT_MARKER = '.genie-workspace-init';

/**
 * Format the marker file's contents.  Factored out so both the
 * host-path and Mount-cap variants emit the same payload.
 */
const formatMarkerContent = () =>
  `# Genie workspace initialised ${new Date().toISOString()}\n`;

// ---------------------------------------------------------------------------
// Host filesystem implementation (used by dev-repl, which has no daemon).
// ---------------------------------------------------------------------------

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
 * Initialise an agent workspace from the shipped template via the host
 * filesystem.  Used by `dev-repl.js`, which has no daemon and no Mount
 * cap.  Daemon-hosted callers should prefer {@link initWorkspaceMount}
 * so the seed bytes ride the same cap surface that `spawnAgent` binds
 * into the slice.
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
  await fs.writeFile(markerPath, formatMarkerContent());

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

// ---------------------------------------------------------------------------
// Endo Mount cap implementation (preferred path for the daemon-hosted
// genie; lets the seed copy ride the same cap surface that spawnAgent
// binds into the slice).
// ---------------------------------------------------------------------------

/**
 * Recursively copy every file from `src` (host fs) into the Mount cap's
 * tree at `destSegments`, skipping files that already exist on the
 * destination Mount.
 *
 * The Mount's `writeText` automatically creates parent directories
 * (see `packages/daemon/src/mount.js`'s `writeText` → `makePath`),
 * so we only need an explicit `makeDirectory` call when the template
 * carries an empty subdirectory.
 *
 * @param {string} src - Source directory (template) on the host fs.
 * @param {WorkspaceMountCap} mount - Destination Mount cap.
 * @param {string[]} destSegments - Path segments under the mount root.
 */
const copyTreeIntoMount = async (src, mount, destSegments) => {
  await Promise.resolve();

  /** @type {Dirent[]} */
  let entries;
  try {
    entries = await fs.readdir(src, { withFileTypes: true });
  } catch {
    // Template directory missing — nothing to seed.
    return;
  }

  // `for await` over a sync iterable is a documented pattern for
  // sequential awaits without tripping the no-await-in-loop lint;
  // the seed copy must stay sequential because each `writeText`
  // races against the directory's existence checks above.
  for await (const entry of entries) {
    const srcPath = join(src, entry.name);
    const childSegments = harden([...destSegments, entry.name]);

    if (entry.isDirectory()) {
      // Idempotent: makeDirectory bottoms out on `makePath`, which is
      // a no-op when the directory already exists.
      await E(mount).makeDirectory(childSegments);
      await copyTreeIntoMount(srcPath, mount, [...childSegments]);
    } else if (!(await E(mount).has(...childSegments))) {
      // Destination missing — read the seed bytes from the host fs
      // and write them through the Mount surface.  When the file is
      // already present we leave it alone so user customisations
      // survive daemon restarts.
      const content = await fs.readFile(srcPath, 'utf8');
      await E(mount).writeText(childSegments, content);
    }
  }
};

/**
 * Initialise an agent workspace from the shipped template via an Endo
 * `Mount` cap.  Reads the seed files from the host filesystem (the
 * genie unconfined caplet has unrestricted host fs access during boot)
 * but writes them through `E(mount).writeText`, so the daemon-side
 * confinement and the slice's bind-mount see the seed bytes through
 * the same cap surface.
 *
 * Existing files on the destination Mount are never overwritten so
 * user customisations survive daemon restarts.  Writes the marker
 * file (`.genie-workspace-init`) on completion so subsequent launches
 * skip the copy.
 *
 * @param {WorkspaceMountCap} mount - Destination Mount capability.
 * @returns {Promise<boolean>} `true` if initialisation ran, `false`
 *   if the workspace was already initialised.
 */
export const initWorkspaceMount = async mount => {
  await Promise.resolve();

  if (await E(mount).has(INIT_MARKER)) {
    // Marker present — workspace already seeded.
    return false;
  }

  await copyTreeIntoMount(TEMPLATE_DIR, mount, []);

  await E(mount).writeText(INIT_MARKER, formatMarkerContent());

  return true;
};
harden(initWorkspaceMount);

/**
 * Returns true if the Mount cap points at a valid agent workspace,
 * by checking for the small marker file left by
 * {@link initWorkspaceMount} (or {@link initWorkspace} writing into
 * the same backing directory).
 *
 * @param {WorkspaceMountCap} mount - The Mount capability to probe.
 * @returns {Promise<boolean>}
 */
export const isWorkspaceMount = async mount => {
  await Promise.resolve();
  return E(mount).has(INIT_MARKER);
};
harden(isWorkspaceMount);
