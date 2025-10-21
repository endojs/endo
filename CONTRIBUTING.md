# Initial setup

```sh
git clone git@github.com:endojs/endo.git
cd endo
yarn
```

Endo is a yarn workspaces repository. Running yarn in the root will install
and hoist most dependencies up to the root `node_modules`.

Note: running yarn `--ignore-scripts` will not complete the setup of SES.
Note: Endo uses `lerna` only for releasing. `lerna bootstrap` is unlikely to work.

# Creating a new package

Run <code>[scripts/create-package.sh](./scripts/create-package.sh) $name</code>,
then update the resulting README.md, package.json (specifically setting
`description` and [if appropriate] removing `"private": false`), index.js, and
index.test.js files.

# Code and Documentation Formatting Conventions

## Line Wrapping

- **General text**: Wrap lines at approximately 80-85 characters to maintain readability.
- **Code examples**: Follow the same line wrapping conventions as general text.
- **Long sentences**: Break long sentences across multiple lines, with each line being
  approximately 80-85 characters.
- **New sentences**: Begin new sentences on fresh lines.
  This ensures that changes to one sentence that require adjustments to line
  wrapping do not cascade into a subsequent sentence.
  This allows us to avoid expressing an opinion on one or two spaces after
  periods.

# Making a Release

* Review the [next release](
https://github.com/endojs/endo/labels/next-release
) label for additional tasks or pending changes particular to this release.

* Do not release from a Git workspace.
  In a Git workspace, `.git` is a file and not a directory.
  At time of writing, Lerna does not account for Git workspaces when it looks
  up the repository location.

* Create a release branch.

  ```sh
  now=`date -u +%Y-%m-%d-%H-%M-%S`
  git checkout -b release-$now
  ```

* Create the release CHANGELOGs.

  ```sh
  yarn lerna version --no-push --conventional-graduate --no-git-tag-version
  ```

  Use `--conventional-prerelease` instead of `--conventional-graduate` if you
  just want to generate a dev release.

* Commit the results.

  ```sh
  git commit -am 'chore: lerna version'
  ```

* Identify `NEWS.md` files that need to be updated.
  Ensure `NEWS.md` captures all user-visible changes in prose that are
  user-relevant.

  ```sh
  git grep '# Next'
  ```

  For each of these files, copy the version number and timestamp from the
  adjacent `CHANGELOG.md` generated in the previous step.
  For example,

  ```diff
  -# Next release
  +# 0.5.1 (2021-08-12)
  ```

  Also, capture these into a release notes document, where each heading
  is the name of the package and the version number instead of the
  version number and release date, like so:

  ```
  # `ses` 1.0.0
  ```

  In the release notes document, we do not manually wrap long lines.
  All paragraphs should be joined into long lines, since Github uses a
  different flavor of Markdown for descriptions and release notes.

* Commit the results.

  ```sh
  git commit -am 'docs: Update release notes'
  ```

* Update `yarn.lock`.

  ```sh
  yarn
  git commit -um 'chore: Update yarn.lock'
  ```

* Push the branch.

  ```sh
  git push -u origin release-$now
  ```

* Create a pull request and request a review, using the release notes
  from above as the description.
  This is an opportunity to:

  - verify that the changes pass tests under continuous integration,
  - reflect on whether the automatically chosen version numbers tell an
    accurate story about the backward and mutual compatibility of the packages
    you are about to publish,
  - and to verify that all user-facing changes are noted in the NEWS.md files
    with appropriate migration advice when necessary.

* When your reviewer has approved your release, use `git rebase -i
  origin/master` to remove the automatically generated `chore: lerna version`
  commit.

* Recreate the changelogs with the current date *and* generate tags for the new
  versions. This is the effect of removing the `--no-git-tag-version` flag.

  ```sh
  yarn lerna version --no-push --conventional-graduate
  ```

* Update `yarn.lock`.

  ```sh
  yarn
  git commit -um 'chore: Update yarn.lock'
  ```

* Publish the versions to npm.
  Being a member of the project or organization and having two-factor
  authentication may be necessary. It may be necessary to login with
  `npm login`. You can check with `npm whoami`.

  ```sh
  npm whoami
  # if it does not show you logged in, then do
  npm login
  # two factor authentication stuff
  yarn lerna publish from-package
  # repeat this command until all packages are successfully published
  ```

* To verify that packages were published, go to the npm web page for the
  package, for example
  [https://www.npmjs.com/package/ses](https://www.npmjs.com/package/ses).
  ***However*** do not be alarmed if it does not show your new version for
  a distressingly long time. Instead you can verify the version with

  ```sh
  npm view ses
  ```

* Force push these changes back to the pull request branch.

  ```sh
  git push origin -f release-$now
  ```

* Merge the release PR into master.
  DO NOT REBASE OR SQUASH OR YOU WILL LOSE REFERENCES TO YOUR TAGS.

  Notice the little triangle on the merge button and select "Create a merge
  commit" from the drop down menu.
  Do not rebase.
  Do not squash.
  Rebasing or squashing will remove the tag from the history of the `master`
  branch.

* Selecting "Create a merge commit" in that drop down is sticky. Assuming you
  normally want "Squash and merge", be sure to set it back to that at your
  next opportunity.

* Push the released tags to Github.

  ```sh
  git tag -l | egrep -e '@[0-9]+\.[0-9]+\.[0-9]+$' | xargs git push origin
  ```

* Go to https://github.com/endojs/endo/releases and create a new release
  using the latest tag for `ses` as the reference tag, and the release
  notes you prepared for the pull request description.

## More information

To get help for the command-line options that will affect these commands, use:

```sh
yarn lerna version --help
yarn lerna publish --help
```
