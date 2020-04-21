
## Making a Release

* Ensure `NEWS.md` captures all user-visible changes in prose that is
  user-relevant.
  Ideally, the news file would conform to the [Keep a
  Changelog](https://keepachangelog.com) specification, but ours do not at this
  time, so adhere to the prevailing pattern.
* Choose a new release number based on the principles of [Semantic
  Versioning](https://semver.org) and whether the news includes breaking
  changes (major number), added features (minor number), or just big fixes
  (patch number).
  Major version bumps should be avoided to the extent that is possible if there
  are any third-party users. A new package name is often better than a major
  version bump.
* Update the title of the first entry in `NEWS.md` to include the new version
  number and the timestamp.
* Update `package.json` version.
* Create a version commit titled "release($PACKAGENAME): v$VERSION"
* Use `npm pack` and `tar tf "$PACKAGENAME-v$VERSION.tgz"` to spot-check
  whether the generated archive contains only and all relevant files.
  We now have a lint rule that ensures that `files` in `package.json` includes
  at least `src`, `dist`, and all `LICENSE*` files, and we can remove this step
  as our confidence grows in our release mechanisms.
  If you have added an `index.d.ts`, you may need to explicitly note this in
  `files` as it is not checked yet.
* `npm publish` to publish the version.
  Being a member of the project or organization and having two-factor
  authentication may be necessary.
* Only after a successful round of validation and publication, create
  a tag `$PACKAGENAME-v$VERSION` with `git tag -a "$TAG" -m "$TAG"`.
* `git push origin master "$TAG"`.
* Update version in `package.json` by suffixing `-1-dev` to the release
  version.
* Add a `Next release` `* No changes yet` section to the head of `NEWS.md`.
* `git add package.json NEWS.md`
* Commit with the message `chore($PACKAGENAME): Back to development with
  $VERSION-1-dev`.
