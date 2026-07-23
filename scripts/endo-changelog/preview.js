/**
 * Preview how pending changesets will render (_more or less_) through Endo's
 * custom changelog generator, without running `changeset version` (which
 * mutates the repo).
 *
 * Usage:
 *
 * ```sh
 * # Render every pending changeset:
 * node scripts/endo-changelog/preview.js
 *
 * # Render specific changeset file(s):
 * node scripts/endo-changelog/preview.js .changeset/hardened-text-codecs.md
 * ```
 *
 * A changeset read from disk carries no `commit`, so `getReleaseLine` makes no
 * GitHub API calls and needs no token; the output is the release-line body as
 * it will appear (indented) under each package's version heading in
 * `CHANGELOG.md`, prior to the downstream prettier pass.
 *
 * @module
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import endoChangelogFunctions from './index.js';
import path from 'node:path';

/** Absolute path to the repo's `.changeset` directory. */
const changesetDir = fileURLToPath(
  new URL('../../.changeset', import.meta.url),
);

/**
 * Strip YAML front matter from a changeset's raw contents, returning just the
 * markdown summary.
 *
 * @param {string} raw
 * @returns {string}
 */
const extractSummary = raw => raw.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();

/**
 * Resolve the list of changeset files to preview: explicit CLI args if given,
 * otherwise every `*.md` in `.changeset` except `README.md`.
 *
 * @returns {Promise<string[]>}
 */
const resolveFiles = async () => {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    return args;
  }
  const entries = await readdir(changesetDir);
  return entries
    .filter(name => name.endsWith('.md') && !/^README\.md$/i.test(name))
    .map(name => `${changesetDir}/${name}`);
};

const filepaths = await resolveFiles();

for (const filepath of filepaths) {
  const summary = extractSummary(await readFile(filepath, 'utf8'));
  // The `type` argument is ignored by the GitHub formatter; only the summary
  // and `repo` option affect the rendered text.
  const line = await endoChangelogFunctions.getReleaseLine(
    { summary, commit: undefined, releases: [], id: '' },
    'minor',
    { repo: 'endojs/endo' },
  );
  const relativeFilepath = path.relative(process.cwd(), filepath);
  console.log(`\n# ${relativeFilepath}\n`);
  console.log(line.trim());
}
