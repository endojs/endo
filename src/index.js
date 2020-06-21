import { rollup as rollup0 } from 'rollup';
import path from 'path';
import resolve0 from '@rollup/plugin-node-resolve';
import commonjs0 from '@rollup/plugin-commonjs';
import * as babelParser from '@agoric/babel-parser';
import babelGenerate from '@babel/generator';
import { makeTransform } from '@agoric/transform-eventual-send';

import { SourceMapConsumer } from 'source-map';

const DEFAULT_MODULE_FORMAT = 'nestedEvaluate';
const DEFAULT_FILE_PREFIX = '/bundled-source';
const SUPPORTED_FORMATS = ['getExport', 'nestedEvaluate'];

// eslint-disable-next-line no-useless-concat
const IMPORT_RE = new RegExp('\\b(import)' + '(\\s*(?:\\(|/[/*]))', 'g');
const HTML_COMMENT_RE = new RegExp(`(?:${'<'}!--|--${'>'})`, 'g');

export function tildotPlugin() {
  const transformer = makeTransform(babelParser, babelGenerate);
  return {
    transform(code, _id) {
      return {
        code: transformer(code),
        map: null,
      };
    },
  };
}

export default async function bundleSource(
  startFilename,
  moduleFormat = DEFAULT_MODULE_FORMAT,
  powers = undefined,
) {
  if (!SUPPORTED_FORMATS.includes(moduleFormat)) {
    throw Error(`moduleFormat ${moduleFormat} is not implemented`);
  }
  const {
    commonjsPlugin = commonjs0,
    rollup = rollup0,
    resolvePlugin = resolve0,
    pathResolve = path.resolve,
    externals = [],
  } = powers || {};
  const resolvedPath = pathResolve(startFilename);
  const bundle = await rollup({
    input: resolvedPath,
    treeshake: false,
    preserveModules: moduleFormat === 'nestedEvaluate',
    external: ['@agoric/harden', ...externals],
    plugins: [
      resolvePlugin({ preferBuiltins: true }),
      tildotPlugin(),
      commonjsPlugin(),
    ],
  });
  const { output } = await bundle.generate({
    exports: 'named',
    format: 'cjs',
    sourcemap: true,
  });
  // console.log(output);

  // Create a source bundle.
  const sourceBundle = {};
  let entrypoint;
  for (const chunk of output) {
    if (chunk.isAsset) {
      throw Error(`unprepared for assets: ${chunk.fileName}`);
    }
    const { code, fileName, isEntry } = chunk;
    if (isEntry) {
      entrypoint = fileName;
    }
    let unmappedCode = code;
    if (
      moduleFormat === 'nestedEvaluate' &&
      !fileName.startsWith('_virtual/')
    ) {
      // TODO: Should parse the generated chunk with Babel.
      // We rearrange the generated chunk according to its sourcemap to move
      // its source lines back to the right place, like Babel generator's
      // `retainLines: true`.
      unmappedCode = '';
      // eslint-disable-next-line no-await-in-loop
      const consumer = await new SourceMapConsumer(chunk.map);
      const genLines = code.split('\n');
      let lastLine = 1;
      for (let genLine = 0; genLine < genLines.length; genLine += 1) {
        const pos = consumer.originalPositionFor({
          line: genLine + 1,
          column: 0,
        });
        const { line: origLine } = pos;

        const srcLine = origLine === null ? lastLine : origLine;
        const priorChar = unmappedCode[unmappedCode.length - 1];
        if (
          srcLine === lastLine &&
          !['\n', ';', '{', undefined].includes(priorChar) &&
          !['}'].includes(genLines[genLine][0])
        ) {
          unmappedCode += `;`;
        }
        while (lastLine < srcLine) {
          unmappedCode += `\n`;
          lastLine += 1;
        }
        unmappedCode += genLines[genLine];
      }
    }

    // Rewrite apparent import expressions so that they don't fail under SES.
    // We also do apparent HTML comments.
    const defangedCode = unmappedCode
      .replace(IMPORT_RE, '$1notreally')
      .replace(HTML_COMMENT_RE, '<->');
    // console.log(`<<<<<< ${fileName}\n${defangedCode}\n>>>>>>>>`);
    sourceBundle[fileName] = defangedCode;
  }

  if (!entrypoint) {
    throw Error('No entrypoint found in output bundle');
  }

  // 'sourceBundle' is now an object that contains multiple programs, which references
  // require() and sets module.exports . This is close, but we need a single
  // stringifiable function, so we must wrap it in an outer function that
  // returns the entrypoint exports.
  //
  // build-kernel.js will prefix this with 'export default' so it becomes an
  // ES6 module. The Vat controller will wrap it with parenthesis so it can
  // be evaluated and invoked to get at the exports.

  // const sourceMap = `//# sourceMappingURL=${output[0].map.toUrl()}\n`;

  // console.log(sourceMap);
  let sourceMap;
  let source;
  if (moduleFormat === 'getExport') {
    sourceMap = `//# sourceURL=${resolvedPath}\n`;

    if (Object.keys(sourceBundle).length !== 1) {
      throw Error('unprepared for more than one chunk');
    }

    source = `\
function getExport() { 'use strict'; \
let exports = {}; \
const module = { exports }; \
\
${sourceBundle[entrypoint]}

return module.exports;
}
${sourceMap}`;
  } else if (moduleFormat === 'nestedEvaluate') {
    sourceMap = `//# sourceURL=${DEFAULT_FILE_PREFIX}-preamble.js\n`;

    // This function's source code is inlined in the output bundle.
    // It creates an evaluable string for a given module filename.
    const filePrefix = DEFAULT_FILE_PREFIX;
    function createEvalString(filename) {
      const code = sourceBundle[filename];
      if (!code) {
        return undefined;
      }
      return `\
(function getExport(require, exports) { \
  'use strict'; \
  const module = { exports }; \
  \
  ${code}
  return module.exports;
})
//# sourceURL=${filePrefix}/${filename}
`;
    }

    // This function's source code is inlined in the output bundle.
    // It figures out the exports from a given module filename.
    const nsBundle = {};
    const nestedEvaluate = _src => {
      throw Error('need to override nestedEvaluate');
    };
    function computeExports(filename, exportPowers, exports) {
      const { require: systemRequire, _log } = exportPowers;
      // This captures the endowed require.
      const match = filename.match(/^(.*)\/[^/]+$/);
      const thisdir = match ? match[1] : '.';
      const contextRequire = mod => {
        // Do path algebra to find the actual source.
        const els = mod.split('/');
        let prefix;
        if (els[0][0] === '@') {
          // Scoped name.
          prefix = els.splice(0, 2).join('/');
        } else if (els[0][0] === '.') {
          // Relative.
          els.unshift(...thisdir.split('/'));
        } else {
          // Bare or absolute.
          prefix = els.splice(0, 1);
        }

        const suffix = [];
        for (const el of els) {
          if (el === '.' || el === '') {
            // Do nothing.
          } else if (el === '..') {
            // Traverse upwards.
            suffix.pop();
          } else {
            suffix.push(el);
          }
        }

        // log(mod, prefix, suffix);
        if (prefix !== undefined) {
          suffix.unshift(prefix);
        }
        let modPath = suffix.join('/');
        if (modPath.startsWith('./')) {
          modPath = modPath.slice(2);
        }
        // log('requiring', modPath);
        if (!(modPath in nsBundle)) {
          // log('evaluating', modPath);
          // Break cycles, but be tolerant of modules
          // that completely override their exports object.
          nsBundle[modPath] = {};
          nsBundle[modPath] = computeExports(
            modPath,
            exportPowers,
            nsBundle[modPath],
          );
        }

        // log('returning', nsBundle[modPath]);
        return nsBundle[modPath];
      };

      const code = createEvalString(filename);
      if (!code) {
        // log('missing code for', filename, sourceBundle);
        if (systemRequire) {
          return systemRequire(filename);
        }
        throw Error(
          `require(${JSON.stringify(
            filename,
          )}) failed; no toplevel require endowment`,
        );
      }

      // log('evaluating', code);
      return nestedEvaluate(code)(contextRequire, exports);
    }

    source = `\
function getExportWithNestedEvaluate(filePrefix) {
  'use strict';
  // Serialised sources.
  if (filePrefix === undefined) {
    filePrefix = ${JSON.stringify(DEFAULT_FILE_PREFIX)};
  }
  const moduleFormat = ${JSON.stringify(moduleFormat)};
  const entrypoint = ${JSON.stringify(entrypoint)};
  const sourceBundle = ${JSON.stringify(sourceBundle, undefined, 2)};
  const nsBundle = {};

  ${createEvalString}

  ${computeExports}

  // Evaluate the entrypoint recursively, seeding the exports.
  return computeExports(entrypoint, { require }, {});
}
${sourceMap}`;
  }

  // console.log(sourceMap);
  return { source, sourceMap, moduleFormat };
}
