# Contributing to Endo

## Initial setup

```sh
git clone git@github.com:endojs/endo.git
cd endo
yarn
```

Endo is a yarn workspaces repository. Running yarn in the root will install and
hoist most dependencies up to the root `node_modules`.

Note: running yarn `--ignore-scripts` will not complete the setup of SES.
Note: Endo uses `lerna` only for releasing. `lerna bootstrap` is unlikely to work.

### Action pinning

GitHub Actions are pinned to commit SHAs.
Run `node scripts/update-action-pins.mjs` to refresh patch/minor pins.
Run `node scripts/update-action-pins.mjs --major` for major upgrades.
Use `--min-age-days 0` to bypass the default 5-day age gate (for zero-day fixes).
The updater reads the `# vX` comment on each `uses:` line.
If no version comment exists, it infers the latest tag for that action.

CI enforces pinning with `node scripts/update-action-pins.mjs --check-pins`.
If this check fails, run the updater and commit the resulting changes.

### Creating a new package

Run <code>[scripts/create-package.sh](./scripts/create-package.sh) $name</code>,
then update the resulting README.md, package.json (specifically setting
`description` and [if appropriate] removing `"private": false`), index.js, and
index.test.js files.

### Markdown Style Guide

When writing Markdown documentation:

- Wrap lines at 80 to 100 columns for readability in terminal editors.
- Start each sentence on a new line.
  This ensures changes in one sentence do not cascade into the next in diffs.
- Starting sentences on new lines also obviates any question of whether to use
  one or two spaces after a period.

Example:

```markdown
The Endo stack provides a layered solution through four packages.
Each package has a specific role in enabling safe message passing.
Together, they form the foundation of distributed computing.
```

This convention applies to all documentation files including README.md files,
guides in the `docs/` directory, and package-specific documentation.

**Exception:** Release notes in pull request descriptions and GitHub releases
should use long lines (paragraphs joined without manual wrapping), as GitHub
uses a different Markdown flavor for those contexts.

## Rebuilding `ses`

Changes to `ses` require a `yarn build` to be reflected in any dependency where `import 'ses';` appears. Use `yarn build` under `packages/ses` to refresh the build.
Everything else is wired up thanks to workspaces, so no need to run installs in other packages.

## Using Changesets

Endo uses [Changesets](https://github.com/changesets/changesets) to manage
versioning and changelogs.
A **changeset** is a Markdown file in the `.changeset/` directory that captures:

- Which packages need to be released
- The [semver](https://semver.org/) bump type (major, minor, or patch)
- A changelog entry describing the change

Changesets are "intents to release" that accumulate until maintainers cut a
release.
The changeset files themselves are temporary—when a release is cut, they are
consumed and removed from version control, with their contents incorporated into
each package's `CHANGELOG.md`.

This approach automates version bumping across the monorepo (including internal
dependency updates) and generates changelogs automatically, while keeping humans
in the loop to review and edit release notes before publishing.

Contributors make versioning decisions _at contribution time_ (i.e. _in the PR
itself_), when the context is fresh.

### Adding a Changeset

When your PR includes changes that should be released, add a changeset:

1. Run `yarn changeset`
2. Select the affected packages (use arrow keys to navigate, space to select,
   enter to confirm)
3. Choose the appropriate bump type for each package
4. Write a clear, complete description of the change—what changed, why, and any
   migration notes if needed. Consider security and performance implications.
   This text will appear verbatim in `CHANGELOG.md`, so make it useful for
   consumers of the package.
5. Commit the generated `.changeset/*.md` file with your PR

> Do not be alarmed by the unique, auto-generated names of the changeset files!
> This is expected.

### Editing a Changeset

You typically want to do this _before_ your PR lands, but all you need to do is
find the changeset file in `.changeset/`, edit it, and commit.

### Do I Need a Changeset?

Generally, you need a changeset only if your PR contains **user-facing changes**
to a package—bug fixes, new features, breaking changes, or other modifications
that consumers of the package would notice.

You typically **do not** need a changeset for:

- Documentation-only changes
- Test additions or fixes
- CI/build configuration changes
- Refactoring that doesn't change public behavior

The helpful [changeset-bot](https://github.com/apps/changeset-bot) will comment
on your PR if no changeset is present, but this won't block merging.  

> [!TIP]
>
> When in doubt, ask a friendly maintainer. Avoid the unfriendly ones.

### Release Workflow (For Maintainers)

The release process works as follows:

1. As changesets accumulate on `master`, the `changesets/action` GitHub Action
   (see [.github/workflows/release.yml](.github/workflows/release.yml))
   automatically creates and maintains a **Release PR** titled "Version
   Packages"
2. This Release PR applies all pending changesets; it bumps versions, updates
   `CHANGELOG.md` files, and deletes the consumed changeset files
3. Maintainers review the Release PR to verify versions and changelog entries
   look correct. Maintainer will approve and/or merge when ready.
   Merging will also create tags and GitHub Releases for each affected package.
4. After merging the Release PR, pull `master` and run `yarn release:npm` to
   publish the updated packages to npm.
