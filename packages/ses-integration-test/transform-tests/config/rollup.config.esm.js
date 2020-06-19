import multiEntry from "rollup-plugin-multi-entry";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

export default [
  {
    input: {
      include: ["test/**/*.js"],
      exclude: ["test/require.test.js"]
    },
    output: {
      file: "transform-tests/output/test.esm.js",
      format: "esm"
    },
    external: ["tape", "@agoric/make-hardener"],
    plugins: [
      resolve({
        only: ["@agoric/nat", "ses"]
      }),
      commonjs(),
      multiEntry()
    ]
  }
];

/* (!) Unresolved dependencies
https://rollupjs.org/guide/en#warning-treating-module-as-external-dependency
ses (imported by ../test/test-console.js, ../test/test-date.js, ../test/test-error.js, ../test/test-freeze.js, ../test/test-intl.js, ../test/test-math.js, ../test/test-nesting.js, ../test/test-regexp.js, ../test/test-removal.js, ../test/test-require.js, ../test/test.js)
created transform-tests/output/test.esm.js in 190ms
*/
