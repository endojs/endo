
## Making a Release

* Create a branch off `master`. Unless stated otherwise, all code blocks below
  are examples from the 0.12.7 release of the "ses" package. Further steps below
  assume you are in the directory of the package being released, so let's `cd`
  there first.
  ```console
  $ cd packages/ses
  $ git checkout -b release-12-7
  ```
* Ensure `NEWS.md` captures all user-visible changes in prose that are
  user-relevant.
  Ideally, the news file would conform to the [Keep a
  Changelog](https://keepachangelog.com) specification, but ours do not at this
  time, so adhere to the prevailing pattern.
* Choose a new release number based on the principles of [Semantic
  Versioning](https://semver.org) and whether the news includes breaking
  changes (major number), added features (minor number), or just big fixes
  (patch number).
  Do not use 0.0.x versions, only x.y.z or 0.x.y.
  Versions 0.0.x can't be patched without changes to the dependee.
  Major version bumps should be avoided to the extent that is possible if there
  are any third-party users. A new package name is often better than a major
  version bump.
  ```
  0.12.7
  ```
* Update the title of the first entry in `NEWS.md` to include the new version
  number and the timestamp.
  ```md
  ## Release 0.12.7 (5-April-2021)
  ```
* Update `package.json` version.
  ```json
  {
    "name": "ses",
    "version": "0.12.7",
    ...
  }
  ```
* Update every other `package.json` in this repository that takes a dependency
  on the changed package.
  ```json
  "dependencies": {
    ...
    "ses": "^0.12.7",
    ...
  }
  ```
* Create a version commit titled "chore($PACKAGENAME): v$VERSION"
  ```console
  $ git commit -a -m 'chore(ses): v0.12.7'
  ```
* Use `npm pack` and `tar tf "$PACKAGENAME-v$VERSION.tgz"` to spot-check
  whether the generated archive contains only and all relevant files.
  We now have a lint rule that ensures that `files` in `package.json` includes
  at least `src`, `dist`, and all `LICENSE*` files, and we can remove this step
  as our confidence grows in our release mechanisms.
  ```console
  $ npm pack
  ```
* `npm publish` to publish the version.
  Being a member of the project or organization and having two-factor
  authentication may be necessary. It may be necessary to login with
  `npm login`. You can check with `npm whoami`.
  ```console
  $ npm whoami
  # if it does not show you logged in, then do
  $ npm login
  # two factor authentication stuff
  ```
* Go to the npm web page for the package, for example
  [https://www.npmjs.com/package/ses](https://www.npmjs.com/package/ses).
  ***However*** do not be alarmed if it does not show your new version for
  a distressingly long time. Instead you can verify the version with
  ```console
  $ npm view ses
  ```
* Only after a successful round of validation and publication, create
  a tag `$PACKAGENAME-v$VERSION` with `git tag -a "$TAG" -m "$TAG"`.
  ```console
  $ git tag -a "ses-v0.12.7" -m "ses-v0.12.7"
  ```
* Update version in `package.json` by suffixing `+1-dev` to the release
  version.
  ```json
  {
    "name": "ses",
    "version": "0.12.7+1-dev",
    ...
  }
  ```
* Add a `Next release` `* No changes yet` section to the head of `NEWS.md`.
  ```md
  User-visible changes in SES:

  ## Next Release

  No changes yet.

  ## Release 0.12.7 (5-April-2021)
  ```
* Stage the changes made above.
  ```console
  $ git add package.json NEWS.md
  ```
* Commit with the message `chore($PACKAGENAME): Back to development with
  v$VERSION+1-dev`.
  ```console
  $ git commit -m 'chore(ses): Back to development with v0.12.7+1-dev'
  ```
* Create a pull request from this branch.
  ```console
  $ git push --set-upstream origin release-12-7
  ```

  Create a merge commit. Notice the little triangle on the merge button and select
  "Create a merge commit" from the drop down menu.
  Do not rebase.
  Do not squash.
  Rebasing or squashing will remove the tag from the history of the `master`
  branch.
