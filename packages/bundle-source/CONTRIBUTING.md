# Contributing

Thank you!

## Contact

We use github issues for all bug reports: https://github.com/Agoric/@REPO@/issues

## Installing, Testing

You'll need Node.js version 11 or higher. There is a unit test to
double-check that you have a suitable version.

* git clone https://github.com/Agoric/@REPO@/
* npm install
* npm test

## Pull Requests

Before submitting a pull request, please:

* run `npm test` and make sure all the unit tests pass
* run `npm run-script lint-fix` to reformat the code according to our
  `eslint` profile, and fix any complaints that it can't automatically
  correct

## Making a Release

* edit NEWS.md enumerating any user-visible changes
* `npm version patch` (or `major` or `minor`)
  * that changes `package.json` and `package-lock.json`
  * and does a `git commit` and `git tag` by default
  * to do `git commit` and `git tag` manually, use `--no-git-tag-version`
  * to get signed tags, start with `npm config set sign-git-tag true`
* `npm run build`
* `npm publish`
* `npm version prerelease --preid=dev`
* `git push`

## Versioning

While between releases, we use a version of "X.Y.Z-dev", where "X.Y.(Z-1)"
was the previous release tag. This helps avoid confusion if/when people work
from a git checkout, so bug reports to not make it look like they were using
the previous tagged release.

To achieve this, after doing a release, we run `npm version prerelease
--preid=dev` to modify the `package.json` and `package-lock.json` with
the new in-between version string.
