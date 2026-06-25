// @ts-check
/// <reference types="ses"/>

/** @import { CodeModeGlobal } from './tool.js' */

import { gitCodeModeTypeDeclarations } from './git-types.js';

/**
 * The git exo's per-mode generated TypeScript declarations, keyed by code-mode
 * surface: `git` (read/write) and `gitReadOnly` (inspection verbs only). A
 * consumer composing its own code-mode agent can read these directly to inject
 * git types into a hand-built global.
 */
export { gitCodeModeTypeDeclarations };

/**
 * Build the code-mode global descriptor for an `@endo/exo-git` Git capability.
 * The read-only vs read-write split is a prompt-surface choice: `readOnly`
 * selects the `gitReadOnly` declaration (inspection verbs only) and the
 * matching one-line description. Runtime read-only enforcement stays the exo
 * guard; this only governs which verbs the prompt advertises.
 *
 * @param {object} options
 * @param {string} options.name JS-identifier lexical binding name.
 * @param {string | string[]} [options.petName] Pet name to look the capability
 *   up by; defaults to `name`.
 * @param {boolean} [options.readOnly] Select the read-only prompt surface.
 * @returns {CodeModeGlobal}
 */
export const makeGitGlobal = ({ name, petName = name, readOnly = false }) =>
  harden({
    name,
    petName,
    description: readOnly
      ? 'Read-only @endo/exo-git Git capability for repository inspection.'
      : 'Read/write @endo/exo-git Git capability for repository changes.',
    declaration: readOnly
      ? gitCodeModeTypeDeclarations.gitReadOnly
      : gitCodeModeTypeDeclarations.git,
  });
harden(makeGitGlobal);
