import multiEntry from "rollup-plugin-multi-entry";
import resolve from "rollup-plugin-node-resolve";

export default [
  {
    input: {
      include: ["test/**/*.js"]
    },
    output: {
      file: "transform-tests/output/test.cjs.js",
      format: "cjs"
    },
    external: ["tape", "@agoric/make-hardener"],
    plugins: [
      multiEntry(),
      resolve({
        only: ["@agoric/nat", "ses"]
      })
    ]
  }
];
