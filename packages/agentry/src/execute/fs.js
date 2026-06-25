// @ts-check
/// <reference types="ses"/>

/** @import { CodeModeGlobal } from './tool.js' */

import { fsCodeModeTypeDeclarations } from './fs-types.js';

/**
 * The filesystem exo's generated TypeScript declarations, keyed by code-mode
 * surface: `workspace` (the writable `@endo/platform/fs/extended` Filesystem).
 * A consumer composing its own code-mode agent can read these directly to
 * inject the workspace types into a hand-built global.
 */
export { fsCodeModeTypeDeclarations };

/**
 * Build the code-mode global descriptor for a writable
 * `@endo/platform/fs/extended` Filesystem (the repository `workspace`).
 *
 * @param {object} options
 * @param {string} options.name JS-identifier lexical binding name.
 * @param {string | string[]} [options.petName] Pet name to look the capability
 *   up by; defaults to `name`.
 * @returns {CodeModeGlobal}
 */
export const makeWorkspaceGlobal = ({ name, petName = name }) =>
  harden({
    name,
    petName,
    description:
      'Writable @endo/platform/fs/extended Filesystem for the repository.',
    declaration: fsCodeModeTypeDeclarations.workspace,
  });
harden(makeWorkspaceGlobal);
