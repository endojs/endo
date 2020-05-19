import path from "path";
import resolve from "rollup-plugin-node-resolve";

export default [
  {
    input: "ses",
    output: [
      {
        file: path.resolve(__dirname, "../../bundles/rollup.js"),
        format: "iife"
      }
    ],
    plugins: [
      resolve({
        only: [
          "ses",
          "@agoric/make-hardener",
          "@agoric/transform-module",
          "@agoric/babel-standalone"
        ]
      })
    ]
  }
];
