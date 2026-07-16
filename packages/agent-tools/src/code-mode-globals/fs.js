// @ts-check
/// <reference types="ses"/>

/** @import { CodeModeGlobal } from '../code-mode/evaluate-tool.js' */

import { fsDeclarations } from '../../generated/code-mode-globals/fs-declarations.js';

/**
 * The filesystem exo's generated TypeScript declarations, keyed by code-mode
 * surface: `workspace` (the writable `@endo/platform/fs/extended` Filesystem).
 * A consumer composing its own code-mode agent can read these directly to
 * inject the workspace types into a hand-built global.
 */
export { fsDeclarations };

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
    declaration: fsDeclarations.workspace,
  });
harden(makeWorkspaceGlobal);
