const rollup = require('rollup');
const fs = require('fs');

async function build() {
  const bundle = await rollup.rollup({input: 'src/bundled/index'});
  let { code } = await bundle.generate({format: 'iife',
                                          //file: 'src/bundle.js',
                                          name: 'makeBundle'});
  // that gets us something like:
  //
  // var makeBundle = (function (exports) { ... exports.createSES = createSES; return exports }({}));\n
  //
  // we want:
  //
  // (function(exports){..}({})).createSES\n
  //
  // i.e. a string which, when evaluated in a child Realm, returns the
  // createSES function ready to invoke

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
  code += `.createSES\n`;
  console.log(`modified code:`);
  console.log(code);

  // now turn that code into a string definition: an importable module which
  // gives the importer access to the above createSES-making string

  const built = `
    const createSESString = ${JSON.stringify(code)};
    export createSESString;
`;
  fs.writeFileSync('src/bundle.js', built);
  console.log(`wrote ${built.length} to src/bundle.js`);
}

build();


