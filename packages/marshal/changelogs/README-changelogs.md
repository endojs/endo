For each PR, add a file to this directory named $ISSUENUMBER.txt , and
describe any downstream-visible changes in it (one per line). For libraries,
this should include anything a developer using this library needs to know
when they upgrade to the new version (API changes, new features, significant
bugs fixed). If the PR only makes internal changes (refactorings,
documentation updates), you should still add a file, but leave it empty.

These files will be concatenated together and added to the NEWS.md file
during the release process. Their filenames will be used to indicate which
issues were closed in the release.

See the top-level developer docs for more details.

