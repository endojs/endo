import resolve from "@rollup/plugin-node-resolve";
import commonjs from '@rollup/plugin-commonjs';

export default [
  {
    input: "src/bootstrap-stage-2.js",
    output: {
      file: `dist/bootstrap-stage-2.js`,
      format: "umd",
      name: "Bootstrap"
    },
    plugins: [resolve(), commonjs()]
  }
];
