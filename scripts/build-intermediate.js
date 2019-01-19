const rollup = require('rollup');
const fs = require('fs');

function bundle() {
  return rollup.rollup({input: 'src/bundle/index'}
                      ).then(bundle =>
                             bundle.generate({format: 'iife',
                                              sourcemap: true,
                                              name: 'makeBundle'
                                             }));
}

function process(code, map) {
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
  //console.log(`original bundled code:`);
  //console.log(code);
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
  //console.log(`modified code:`);
  //console.log(code);

  // now turn that code into a string definition: an importable module which
  // gives the importer access to the above exports-making string

  const built = `
    export const creatorStrings = ${JSON.stringify(code)};
`;
  fs.writeFileSync('src/stringifiedBundle', built);
  console.log(`wrote ${built.length} to src/stringifiedBundle`);
  //fs.writeFileSync('src/stringifiedBundle.map', map);
}

function build() {
  bundle().then(function(o) {
    const { output } = o;
    for (const chunkOrAsset of output) {
      if (chunkOrAsset.isAsset) {
        throw Error(`not expecting an asset: ${chunkOrAsset.fileName}`);
      }
      const { code, map } = chunkOrAsset;
      process(code, map);
      return; // there should be only one chunk, hopefully
    }
  });
}

build();


