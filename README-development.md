
## Making a Release

* `npm version patch` (or `major` or `minor`)
  * that changes `package.json` and `package-lock.json`
  * and does a `git commit` and `git tag` by default
  * to do `git commit` and `git tag` manually, use `--no-git-tag-version`
  * to get signed tags, start with `npm config set sign-git-tag true`
* `npm run build`
* `npm publish`
* `npm version prerelease --preid=dev`
* `git commit -am 'development version'`
* `git push`

## Versioning

While between releases, we use a version of "X.Y.Z-dev", where "X.Y.(Z-1)"
was the previous release tag. This helps avoid confusion if/when people work
from a git checkout, so bug reports to not make it look like they were using
the previous tagged release.

To achieve this, after doing a release, we run `npm version prerelease
--preid=dev`, then `git commit -am 'development version'`, to modify the
`package.json` and `package-lock.json` with the new in-between version
string.
