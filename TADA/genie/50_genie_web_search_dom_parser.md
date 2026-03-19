# Work on @endo/genie — web search tool

Okay so the tool in `packages/genie/src/tools/web-search.js`:
- tries to use `DOMParser` around line 72
- but that implicit / global dependency does not exist in node.js
- I do not want to use any of the existing npm modules for parsing HTML or XML doms tho

1. [x] Write our own DOM parsing library inside the `@endo/genie` package:
  - its default export must be a canonical `DOMParser`
  - with a method like `parseFromString(content, type) => Document`
  - the document returned must be fully featured enough to support query selectors like:
    - `const stuff = doc.querySelectorAll('.some .typical .selectors')`
  - Created: `src/dom-parser/index.js` (DOMParser class), `src/dom-parser/document.js` (DomDocument/DomElement with querySelector support), `src/dom-parser/selector.js` (CSS selector parser/matcher)

2. [x] Do Not use any new external dependencies, write all your own HTML and selector parsing code
  - All parsing is built on the existing `src/dom-parser/tokenizer.js` — zero new dependencies

3. [x] Write Unit tests for all that DOM parsing code using AVA
  - 52 tests in `test/dom-parser.test.js` covering tokenizer, selector parser, document builder, querySelector/querySelectorAll, getElementsBy*, DOMParser class, and DuckDuckGo-like HTML parsing

4. [x] Add those tests into the @endo/genie package.json
  - Added `test`, `test:dom-parser`, and `test:interval` scripts — all 52 tests pass

5. [x] finally update the `packages/genie/src/tools/web-search.js` tool to use our new internal `DOMParser` implementation
  - Added `import { DOMParser } from '../dom-parser/index.js'` — the existing `new DOMParser()` call now resolves correctly in Node.js
