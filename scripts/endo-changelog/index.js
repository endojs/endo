import changelogGitHubFunctions from '@changesets/changelog-github';
import { collapseHardBreaks } from './collapse-hard-breaks.js';

/**
 * Endo's changelog generator: a thin wrapper around
 * `@changesets/changelog-github` that collapses single hard linebreaks in
 * changeset summaries into spaces before delegating to the upstream formatter.
 *
 * This prevents the hard-wrapped prose style common in `.md` changeset files
 * from producing awkward indented continuation lines in the generated
 * CHANGELOG entries.
 *
 * It also strips the whitespace-only lines the upstream formatter leaves
 * between indented paragraphs. Changesets v2 happened to clean these up with
 * its own Prettier pass; v3 respects `.prettierignore` (which ignores `*.md`)
 * and so no longer does.
 *
 * @type {typeof changelogGitHubFunctions}
 */
const endoChangelogFunctions = {
  ...changelogGitHubFunctions,
  getReleaseLine: async (changeset, type, options) => {
    const line = await changelogGitHubFunctions.getReleaseLine(
      { ...changeset, summary: collapseHardBreaks(changeset.summary) },
      type,
      options,
    );
    return line.replace(/^[ \t]+$/gm, '');
  },
};

export default endoChangelogFunctions;
