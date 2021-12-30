# Contributing

Thank you!

## Contact

We use github issues for all bug reports:
https://github.com/Agoric/agoric-sdk/issues Please add a [promise-kit]
prefix to the title and `promise-kit` tag to promise-kit-related issues.

## Installing, Testing

You'll need Node.js version 11 or higher.

* `git clone https://github.com/Agoric/agoric-sdk/`
* `cd agoric-sdk`
* `yarn install`
* `yarn build` (This *must* be done at the top level to build all of
  the packages)
* `cd packages/promise-kit`
* `yarn test`

## Pull Requests

Before submitting a pull request, please:

* run `yarn test` within `packages/promise-kit` and make sure all the unit
  tests pass (running `yarn test` at the top level will test all the
  monorepo packages, which can be a good integration test.)
* run `yarn run lint-fix` to reformat the code according to our
  `eslint` profile, and fix any complaints that it can't automatically
  correct

## Making a Release

* edit NEWS.md enumerating any user-visible changes. (If there are
  changelogs/ snippets, consolidate them to build the new NEWS
  entries, and then delete all the snippets.)
* make sure `yarn config set version-git-tag false` is the current
  setting
* `yarn version` (interactive) or `yarn version --major` or `yarn version --minor`
  * that changes `package.json`
  * and does NOT do a `git commit` and `git tag`
* `git add .`
* `git commit -m "bump version"`
* `git tag -a promise-kit-v$VERSION -m "promise-kit-v$VERSION"`
* `yarn publish --access public`
* `git push`
* `git push origin promise-kit-v$VERSION`
