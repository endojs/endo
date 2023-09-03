# Initial setup

```
git clone git@github.com:endojs/endo.git
cd endo
pnpm install
```

Endo is a pnpm workspaces repository. Running pnpm in the root will install and hoist most dependencies up to the root `node_modules`.

Note: running pnpm `--ignore-scripts` will not complete the setup of SES.
Note: Endo uses `lerna` only for releasing. `lerna bootstrap` is unlikely to work.

## Rebuilding `ses`

Changes to `ses` require a `pnpm build` to be reflected in any dependency where `import 'ses';` appears. Use `pnpm build` under `packages/ses` to refresh the build.
Everything else is wired up thanks to workspaces, so no need to run installs in other packages.

# Making a Release

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
  pnpm lerna version --no-push --conventional-graduate --no-git-tag-version
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

* Commit the results.

  ```sh
  git commit -am 'docs: Update release notes'
  ```

* Push the branch.

  ```sh
  git push -u origin release-$now
  ```

* Create a pull request and request a review.
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
  pnpm lerna version --no-push --conventional-graduate
  ```

* Force push these changes back to the pull request branch.

  ```sh
  git push origin -f release-$now
  ```

* Ensure your dependency solution is fresh and rebuild all generated assets.

  ```sh
  pnpm install
  pnpm build
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
  pnpm lerna publish from-package
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

## More information

To get help for the command-line options that will affect these commands, use:

```sh
pnpm lerna version --help
pnpm lerna publish --help
```
