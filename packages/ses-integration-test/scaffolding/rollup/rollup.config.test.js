import path from "path";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

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
      }),
      commonjs()
    ]
  }
];
