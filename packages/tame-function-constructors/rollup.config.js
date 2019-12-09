import { terser } from "rollup-plugin-terser";

export default [
  {
    input: "src/main.js",
    output: [
      {
        file: "dist/tame-function-constructors.cjs.js",
        format: "cjs",
        sourcemap: true
      },
      {
        file: `dist/tame-function-constructors.umd.js`,
        name: "Evaluator",
        format: "umd",
        sourcemap: true
      },
      {
        file: `dist/tame-function-constructors.esm.js`,
        format: "esm",
        sourcemap: true
      }
    ]
  },
  {
    input: "src/main.js",
    output: [
      {
        file: `dist/tame-function-constructors.umd.min.js`,
        name: "Evaluator",
        format: "umd",
        sourcemap: true
      },
      {
        file: `dist/tame-function-constructors.esm.min.js`,
        format: "esm",
        sourcemap: true
      }
    ],
    plugins: [terser()]
  }
];
