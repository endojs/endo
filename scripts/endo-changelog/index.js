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
 * @type {typeof changelogGitHubFunctions}
 */
const endoChangelogFunctions = {
  ...changelogGitHubFunctions,
  getReleaseLine: (changeset, type, options) =>
    changelogGitHubFunctions.getReleaseLine(
      { ...changeset, summary: collapseHardBreaks(changeset.summary) },
      type,
      options,
    ),
};

export default endoChangelogFunctions;
