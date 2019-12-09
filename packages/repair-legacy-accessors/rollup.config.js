import { terser } from "rollup-plugin-terser";

export default [
  {
    input: "src/main.js",
    output: [
      {
        file: "dist/repair-legacy-accessors.cjs.js",
        format: "cjs",
        sourcemap: true
      },
      {
        file: `dist/repair-legacy-accessors.umd.js`,
        name: "Evaluator",
        format: "umd",
        sourcemap: true
      },
      {
        file: `dist/repair-legacy-accessors.esm.js`,
        format: "esm",
        sourcemap: true
      }
    ]
  },
  {
    input: "src/main.js",
    output: [
      {
        file: `dist/repair-legacy-accessors.umd.min.js`,
        name: "Evaluator",
        format: "umd",
        sourcemap: true
      },
      {
        file: `dist/repair-legacy-accessors.esm.min.js`,
        format: "esm",
        sourcemap: true
      }
    ],
    plugins: [terser()]
  }
];
