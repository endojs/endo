import { rollup } from 'rollup';
import path from 'path';
import resolve from 'rollup-plugin-node-resolve';
import eventualSend from '@agoric/acorn-eventual-send';
import * as acorn from 'acorn';

const DEFAULT_MODULE_FORMAT = 'getExport';

export default async function bundleSource(
  startFilename,
  moduleFormat = DEFAULT_MODULE_FORMAT,
) {
  const resolvedPath = path.resolve(startFilename);
  const bundle = await rollup({
    input: resolvedPath,
    treeshake: false,
    external: ['@agoric/evaluate', '@agoric/nat', '@agoric/harden'],
    plugins: [resolve({ preferBuiltins: true })],
    acornInjectPlugins: [eventualSend(acorn)],
  });
  const { output } = await bundle.generate({
    exports: 'named',
    format: moduleFormat === 'getExport' ? 'cjs' : moduleFormat,
  });
  if (output.length !== 1) {
    throw Error('unprepared for more than one chunk/asset');
  }
  if (output[0].isAsset) {
    throw Error(`unprepared for assets: ${output[0].fileName}`);
  }
  let { code: source } = output[0];

  // 'source' is now a string that contains a program, which references
  // require() and sets module.exports . This is close, but we need a single
  // stringifiable function, so we must wrap it in an outer function that
  // returns the exports.
  //
  // build-kernel.js will prefix this with 'export default' so it becomes an
  // ES6 module. The Vat controller will wrap it with parenthesis so it can
  // be evaluated and invoked to get at the exports.

  const sourceMap = `//# sourceURL=${resolvedPath}\n`;
  if (moduleFormat === 'getExport')
    source = `\
function getExport() { 'use strict'; \
let exports = {}; \
const module = { exports }; \
\
${source}

return module.exports;
}
`;

  return { source, sourceMap, moduleFormat };
}
