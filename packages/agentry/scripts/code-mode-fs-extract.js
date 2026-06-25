// @ts-check
/// <reference types="ses"/>

/**
 * Filesystem-specific code-mode type extraction: the `workspace` declaration,
 * built with the generic guard walker ({@link extractGuardIR}) from the
 * `@endo/platform/fs/extended` interface guards.
 *
 * `workspace` reads the runtime `M.interface` guards of
 * `@endo/platform/fs/extended` (`FilesystemInterface` and the remotables it
 * reaches). The FS `.d.ts` is a deliberate four-method stub, so the TypeScript
 * path would yield a near-useless declaration here; the guards are the richest
 * available source for this exo. Enriching the FS `.d.ts` so a TypeScript path
 * could replace this is parked for a separate later design.
 */

import {
  FilesystemInterface,
  DirectoryInterface,
  FileInterface,
  CursorInterface,
  OpenFileInterface,
  LockInterface,
  XattrsInterface,
  NodeWatcherInterface,
  BlobRefInterface,
  PassableReaderInterface,
  PassableBytesReaderInterface,
  PassableBytesWriterInterface,
} from '@endo/platform/fs/extended/type-guards.js';

import { extractGuardIR, renderDeclaration } from './code-mode-type-extract.js';

/**
 * The FS interface guards reachable from the `workspace` Filesystem, keyed by
 * the remotable label the guards use. A label not in this registry renders as
 * an opaque `unknown` alias.
 *
 * @type {Map<string, import('@endo/patterns').InterfaceGuard>}
 */
const FS_REGISTRY = new Map(
  /** @type {[string, any][]} */ ([
    ['Filesystem', FilesystemInterface],
    ['Directory', DirectoryInterface],
    ['File', FileInterface],
    ['Cursor', CursorInterface],
    ['OpenFile', OpenFileInterface],
    ['Lock', LockInterface],
    ['Xattrs', XattrsInterface],
    ['NodeWatcher', NodeWatcherInterface],
    ['BlobRef', BlobRefInterface],
    ['PassableReader', PassableReaderInterface],
    ['PassableBytesReader', PassableBytesReaderInterface],
    ['PassableBytesWriter', PassableBytesWriterInterface],
  ]),
);

const WORKSPACE_ROOT = 'Filesystem';

/**
 * Build the `workspace` IR by walking the `Filesystem` guard.
 *
 * @returns {import('./code-mode-type-extract.js').GlobalTypeIR}
 */
export const buildWorkspaceIR = () =>
  extractGuardIR({ registry: FS_REGISTRY, rootLabel: WORKSPACE_ROOT });
harden(buildWorkspaceIR);

/**
 * Render the `workspace` `{ aux, body }` declaration strings.
 *
 * @returns {Record<'workspace', { aux: string, body: string }>}
 */
export const buildFsTypeDeclarations = () =>
  harden({ workspace: renderDeclaration(buildWorkspaceIR()) });
harden(buildFsTypeDeclarations);
