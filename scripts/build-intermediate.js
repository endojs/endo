const rollup = require('rollup');
const fs = require('fs');

async function build() {
  const bundle = await rollup.rollup({input: 'src/bundled/index'});
  const { code } = await bundle.generate({format: 'iife',
                                          //file: 'src/bundle.js',
                                          name: 'makeBundle'});
  console.log(`bundle.length is ${code.length}`);
  //console.log(code);
  // now turn that code into a string definition
  const built = `
    const bundle = ${JSON.stringify(code)};
    export bundle;
`;
  fs.writeFileSync('src/bundle.js', built);
  console.log(`wrote ${built.length} to src/bundle.js`);
}

build();


