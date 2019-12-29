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

