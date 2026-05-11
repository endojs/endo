# Work on @endo/genie — dom parser tests

Rework the newly added `packages/genie/test/dom-parser.test.js` test for `packages/genie/src/dom-parser/`:

1. [x] use `ava` instead of rolling our own raw unit test
  - I've already installed the dev dependency in genie's package.json, including a file glob for `test/**/*.test.*`

2. [x] tests should look like:
  ```javascript
  import test from 'ava';

  test('test a thing', t => {
    // TODO test the thing
    t.pass(); // ... and remove this example "pass call"
  });
  ```

3. [x] you may even decide to break the test up into topic sections like `packages/genie/test/dom-parser/topic.test.js`
  - Split into 5 topic files under `test/dom-parser/`:
    - `tokenizer.test.js` — 11 tests for the HTML tokenizer
    - `selector.test.js` — 11 tests for the CSS selector parser
    - `document.test.js` — 9 tests for document building and getElementsBy*
    - `query.test.js` — 13 tests for querySelector/querySelectorAll
    - `dom-parser.test.js` — 8 tests for the DOMParser class and edge cases
  - All 52 tests pass with `npx ava test/dom-parser/`
