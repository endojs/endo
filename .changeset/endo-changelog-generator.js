// @ts-check

/**
 * This is a custom `CHANGELOG.md` generator for Endo.
 *
 * It mimics the behavior of `conventional-changelog-conventionalcommits` and is
 * based on `@changesets/changelog-github`. It differs from the latter in two
 * ways:
 *
 * - The version header is a link to a "diff" of the changes between the
 *   previous and current version
 * - The version header contains a date in the format `YYYY-MM-DD`
 *
 * _Note_: This generator does **not** run when the "Version Packages" PR is
 * merged; as such, the date shown may not be the date of the release itself.
 *
 * @see {@link https://github.com/changesets/changesets/tree/main/packages/changelog-github}
 * @see {@link https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-changelog-conventionalcommits}
 * @module
 */

import { getInfo, getInfoFromPullRequest } from '@changesets/get-github-info';

/**
 * @import {ChangelogFunctions, NewChangesetWithCommit} from "@changesets/types"
 */

/**
 * Fetches the links to the commit, pull request, and user from the GitHub API.
 *
 * @param {string} githubServerUrl The URL of the GitHub server.
 * @param {string} repo The repository name.
 * @param {number|undefined} prFromSummary The pull request number from the summary.
 * @param {string|undefined} commitFromSummary The commit hash from the summary.
 * @param {NewChangesetWithCommit} changeset The changeset object.
 * @returns {Promise<{commit: string|null, pull: string|null, user: string|null}>} An object containing the links to the commit, pull request, and user.
 */
const getLinks = async (
  githubServerUrl,
  repo,
  prFromSummary,
  commitFromSummary,
  changeset,
) => {
  if (prFromSummary !== undefined) {
    let { links } = await getInfoFromPullRequest({
      repo,
      pull: prFromSummary,
    });
    if (commitFromSummary) {
      const shortCommitId = commitFromSummary.slice(0, 7);
      links = {
        ...links,
        commit: `[\`${shortCommitId}\`](${githubServerUrl}/${repo}/commit/${commitFromSummary})`,
      };
    }
    return links;
  }
  const commitToFetchFrom = commitFromSummary || changeset.commit;
  if (commitToFetchFrom) {
    let { links } = await getInfo({
      repo,
      commit: commitToFetchFrom,
    });
    return links;
  }
  return {
    commit: null,
    pull: null,
    user: null,
  };
};

/** @type {ChangelogFunctions} */
export default {
  getDependencyReleaseLine: async (
    changesets,
    dependenciesUpdated,
    options,
  ) => {
    if (!options?.repo) {
      throw new Error(
        'Please provide a repo to this changelog generator like this:\n"changelog": ["@changesets/changelog-github", { "repo": "org/repo" }]',
      );
    }
    if (dependenciesUpdated.length === 0) return '';

    const commits = await Promise.all(
      changesets.map(async ({ commit }) => {
        if (commit) {
          let { links } = await getInfo({
            repo: options.repo,
            commit,
          });
          return links.commit;
        }
      }),
    );

    const changesetLink = `- Updated dependencies [${commits
      .filter(value => !!value)
      .join(', ')}]:`;

    const updatedDepenenciesList = dependenciesUpdated.map(
      dependency => `  - ${dependency.name}@${dependency.newVersion}`,
    );

    return [changesetLink, ...updatedDepenenciesList].join('\n');
  },
  getReleaseLine: async (changeset, _type, options) => {
    if (!options?.repo) {
      throw new Error(
        'Please provide a repo to this changelog generator like this:\n"changelog": ["@changesets/changelog-github", { "repo": "org/repo" }]',
      );
    }

    const githubServerUrl =
      process.env.GITHUB_SERVER_URL || 'https://github.com';
    /** @type {number | undefined} */
    let prFromSummary;
    /** @type {string | undefined} */
    let commitFromSummary;
    /** @type {string[]} */
    let usersFromSummary = [];

    const replacedChangelog = changeset.summary
      .replace(/^\s*(?:pr|pull|pull\s+request):\s*#?(\d+)/im, (_, pr) => {
        let num = Number(pr);
        if (!isNaN(num)) prFromSummary = num;
        return '';
      })
      .replace(/^\s*commit:\s*([^\s]+)/im, (_, commit) => {
        commitFromSummary = commit;
        return '';
      })
      .replace(/^\s*(?:author|user):\s*@?([^\s]+)/gim, (_, user) => {
        usersFromSummary.push(user);
        return '';
      })
      .trim();

    const [firstLine, ...futureLines] = replacedChangelog
      .split('\n')
      .map(l => l.trimEnd());

    const links = await getLinks(
      githubServerUrl,
      options.repo,
      prFromSummary,
      commitFromSummary,
      changeset,
    );

    const users = usersFromSummary.length
      ? usersFromSummary
          .map(
            userFromSummary =>
              `[@${userFromSummary}](${githubServerUrl}/${userFromSummary})`,
          )
          .join(', ')
      : links.user;

    const prefix = [
      links.pull === null ? '' : ` ${links.pull}`,
      links.commit === null ? '' : ` ${links.commit}`,
      users === null ? '' : ` Thanks ${users}!`,
    ].join('');

    return `\n\n-${prefix ? `${prefix} -` : ''} ${firstLine}\n${futureLines
      .map(l => `  ${l}`)
      .join('\n')}`;
  },
};
