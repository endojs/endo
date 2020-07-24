import replace from "rollup-plugin-replace";
import multiEntry from "rollup-plugin-multi-entry";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

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
        'import "ses";': ""
      }),
      resolve({
        only: ["@agoric/nat"]
      }),
      commonjs(),
      multiEntry()
    ]
  }
];
