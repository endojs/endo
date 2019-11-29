# Test262 subset

This directory contains a copy of the ECMAScript compliace tests (test262)
relevant to this package.

## Justification

Maintaining a local copy of tests taken at a given revision provides not only
stability, it's also much faster on autobuilds than having to both checkout 
the test262 git repo and filter for relevant tests, and having to do so at 
every test run.

This technique is the same used by all major engines: 
- https://github.com/WebKit/webkit/tree/master/JSTests/test262
- https://github.com/v8/v8/tree/master/test/test262
- https://github.com/mozilla/gecko-dev/tree/master/js/src/tests/test262
etc.

## How to update

For safety, the update script doesn't delete the exisitng tests. You must manually 
empty test262/test first. Hint: use `trash` or a similar utility instead of `rm`.
For example:

```
trash test262/test/*
```

Then execute the update script:

```
npm run update-test262 <path-to-test262-git-clone>
```

The argument is the path to a directory containing a test262 git repo created using:
```
git clone https://github.com/tc39/test262.git
```

All tests that specify `flags: [ <something> ]` in their preamble will be copied across
by the update script, as well as all tests and fixtures from a selected set of paths.
See `./scripts/update-test262.sh` for the selection criteria.

The file `test262/test262-revision.txt` will also be updated with the information relevant
to the version of test262 used. Make sure you commit that file along with the updated
tests.
