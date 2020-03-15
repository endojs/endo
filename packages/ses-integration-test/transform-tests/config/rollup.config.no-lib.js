import replace from "rollup-plugin-replace";
import multiEntry from "rollup-plugin-multi-entry";
import resolve from "rollup-plugin-node-resolve";

export default [
  {
    input: {
      include: ["test/**/*.js"]
    },
    output: {
      file: "transform-tests/output/test.no-lib.cjs.js",
      format: "cjs"
    },
    external: ["ses", "tape", "@agoric/make-hardener"],
    plugins: [
      replace({
        delimiters: ["", ""],
        'import * as SES from "ses";': ""
      }),
      resolve({
        only: ["@agoric/nat"]
      }),
      multiEntry()
    ]
  }
];
