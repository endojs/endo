// @ts-check
/// <reference types="ses"/>

/** @import { CodeModeGlobal } from '../code-mode/evaluate-tool.js' */

import { gitDeclarations } from '../../generated/code-mode-globals/git-declarations.js';

/**
 * The git exo's per-mode generated TypeScript declarations, keyed by code-mode
 * surface: ordinary read/write, history rewrite, and read-only inspection.
 * A consumer composing its own code-mode agent can read these directly to inject
 * git types into a hand-built global.
 */
export { gitDeclarations };

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
 * @param {boolean} [options.historyRewrite] Select the history-rewrite prompt
 *   surface.
 * @returns {CodeModeGlobal}
 */
export const makeGitGlobal = ({
  name,
  petName = name,
  readOnly = false,
  historyRewrite = false,
}) =>
  harden({
    name,
    petName,
    description: readOnly
      ? 'Read-only @endo/exo-git Git capability for repository inspection.'
      : historyRewrite
        ? 'History-rewrite @endo/exo-git Git capability for amend and reword.'
        : 'Read/write @endo/exo-git Git capability for repository changes.',
    declaration: readOnly
      ? gitDeclarations.gitReadOnly
      : historyRewrite
        ? gitDeclarations.gitHistory
        : gitDeclarations.git,
  });
harden(makeGitGlobal);
