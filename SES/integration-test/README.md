## Integration Tests

This test folder creates a tarball of the main repository and runs the main tests in a browser context with multiple bundlers and tools. The goal is to ensure that someone downstream of the package will not have an issue when importing it. 

Note: currently we assume that there is one entry point for the main tests. 

## Bundlers and Tools Tested

Currently, we test:
* webpack
* browserify
* rollup
* parcel 
* mocked version of unpkg (this tests that the `dist/ses.umd.js` file works in the browser as if it came from unpkg. We can't use the actual unpkg because it would test the version currently published to npm, not our local version.)

For more information on how widely each tool is used, see the [2018 State of JS survey](https://2018.stateofjs.com/other-tools/#build_tools). 

## Methods

Note: The actual commands can be found in the `test_integration` job in the CircleCI config (`.circlci/config.yml`).

We start with the unit tests that we already have in `test/test.js` of the main directory. Then, we transform the test file into a few files that will be used by the bundlers:
* a ES6 modules version that replaces the SES local import in the test file (`import SES from '../src/index';`) with an import of the package (`SES`)
* a CommonJS version that does the same replacement (this will be used by browserify, which cannot process ES6 modules)
* a CommonJS version that removes all SES imports (this will be used by unpkg)

IMPORTANT: test-require.js is not part of the test suite for webpack and parcel because they will error when they are unable to find the fake modules `foo` and `unknown`. test-require.js *is* tested by browserify and rollup and mock-unpkg though. 

### Webpack

We take the ES6 modules version of the test that we created and bundle it with webpack (settings in `integration-test/scaffolding/webpack/webpack.config.js`)

### Browserify

We take the Common JS version of the test that we created and bundle it with browserify. 

### Rollup

Rollup is a little trickier. If we try to use rollup to bundle the tests and SES in the same way that we do with Webpack and Browserify, we have major difficulties. Based on the errors, the documentation suggests using three plugins (`rollup-plugin-node-resolve`, `rollup-plugin-commonjs`, `rollup-plugin-node-builtins`), but it still fails. So instead, we divide up the work - Browserify creates the test file from our Tape tests and Rollup creates the bundle that includes SES. Rollup creates an IIFE that creates SES as a global variable, and that is used by the browser version of the Tape tests.

### Parcel 

Parcel uses the ES6 module version of the test that we created and creates a new index.html and JavaScript files in `bundles/parcel`.

### Unpkg

Unpkg isn't really a bundler at all, but is a CDN. We create a browser-friendly version of the tape tests and load both the tests and a mocked version of the library provided by unpkg together on the same page to run the tests. 

Note: In order to test the local version, not the version published to npm, we use the dist files that we have locally that would be served by unpkg after we publish.

TODO: Test `ses.esm.js` as imported in a browser. Currently, there are cross-origin errors, so we would probably have to run a server. 

## Debugging and running locally

To run locally, first run the approprate build script:
* `./integration-test/scripts/build-pre-release-test.sh` (this tests the bundlers)
* `./integration-test/scripts/build-post-release-test.sh` (this tests unpkg after publishing to npm)

This will bundle the test suite with the latest code. To actually test it locally, you can either install `puppeteer` and change the references in `integration-test/test/utility/test-bundler.js` from `puppeteer-core` to `puppeteer` and use chromium. Or, you can test manually by just opening up the index.html files for each test in your browser (the second argument to `testBundler`). For instance, in `integration-test/test/test-post-release.js`, you can open up `'../../scaffolding/unpkg-umd/index.html'` in Chrome and view the output of the tests in the console.
