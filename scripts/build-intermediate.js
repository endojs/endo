const rollup = require('rollup');
const fs = require('fs');

async function build() {
  const bundle = await rollup.rollup({input: 'src/bundled/index'});
  let { code, map } = await bundle.generate({format: 'iife',
                                             sourcemap: true,
                                             name: 'makeBundle'
                                            });
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
  console.log(`original bundled code:`);
  console.log(code);
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
  console.log(`modified code:`);
  console.log(code);

  // now turn that code into a string definition: an importable module which
  // gives the importer access to the above exports-making string

  const built = `
    export const creatorStrings = ${JSON.stringify(code)};
`;
  fs.writeFileSync('src/bundle.js', built);
  console.log(`wrote ${built.length} to src/bundle.js`);
  fs.writeFileSync('src/bundle.js.map', map);
}

build();


