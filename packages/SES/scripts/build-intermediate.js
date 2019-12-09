// eslint-disable-next-line import/no-extraneous-dependencies
const rollup = require('rollup');
// eslint-disable-next-line import/no-extraneous-dependencies
const resolve = require('rollup-plugin-node-resolve');
const fs = require('fs');

function bundle() {
  return rollup
    .rollup({
      input: 'src/bundle/index',
      plugins: [resolve()],
    })
    .then(b =>
      b.generate({ format: 'iife', sourcemap: true, name: 'makeBundle' }),
    );
}

function process(code, _map) {
  // that gets us something like:
  //
  // var makeBundle = (function (exports) { ... exports.createSES = createSES; return exports }({}));\n
  //
  // we want just the exports, so:
  //
  // (function(exports){..}({}))\n
  //
  // i.e. a string which, when evaluated in a child Realm, returns an object
  // with a .createSES property that is the createSES function, ready to
  // invoke

  // todo: use a regexp instead
  // console.log(`original bundled code:`);
  // console.log(code);
  const prefix = 'var makeBundle = ';
  if (!code.startsWith(prefix)) {
    throw new Error('unexpected prefix');
  }
  code = code.slice(prefix.length);
  const suffix = ';\n';
  if (!code.endsWith(suffix)) {
    throw new Error('unexpected suffix');
  }
  code = code.slice(0, code.length - suffix.length);
  // console.log(`modified code:`);
  // console.log(code);

  // now turn that code into a string definition: an importable module which
  // gives the importer access to the above exports-making string

  const built = `
    export const creatorStrings = ${JSON.stringify(code)};
`;
  fs.writeFileSync('src/stringifiedBundle.js', built);
  console.log(`wrote ${built.length} to src/stringifiedBundle.js`);
  // fs.writeFileSync('src/stringifiedBundle.map', map);
}

function build() {
  bundle().then(o => {
    const { output } = o;
    let foundChunk = false;
    for (const chunkOrAsset of output) {
      if (chunkOrAsset.isAsset) {
        throw Error(`not expecting an asset: ${chunkOrAsset.fileName}`);
      }
      if (foundChunk) {
        throw Error(`too many chunks: ${chunkOrAsset.fileName}`);
      }
      foundChunk = true;
      const { code, map } = chunkOrAsset;
      process(code, map);
    }
  });
}

build();
