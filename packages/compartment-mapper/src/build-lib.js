import 'ses';

import fs from 'fs';
import url from 'url';
import { transforms } from 'ses/tools.js';
import { makeBundle } from './bundle.js';
import { makeReadPowers } from './node-powers.js';

lockdown({
  errorTaming: 'unsafe',
  stackFiltering: 'verbose',
});

const { evadeImportExpressionTest } = transforms;

async function main() {
  const bundleRuntimeLocation = new URL(
    './lib-runtime.js',
    import.meta.url,
  ).toString();
  // these read powers must refer to the disk as we are bundling the runtime from
  // this package's sources. The user-provided read powers used elsewhere refer
  // to the user's application source code.
  const { read } = makeReadPowers({ fs, url });
  const runtimeBundle = evadeImportExpressionTest(
    await makeBundle(read, bundleRuntimeLocation),
  ).replace(`'use strict';\n(() => `, `'use strict';\nreturn (() => `);
  const bundle = `\
  // START BUNDLE RUNTIME ================================
  const { loadApplication } = (function(){
  ${runtimeBundle}
  })();
  // END BUNDLE RUNTIME ================================

  globalThis.Endo = Object.freeze({
    loadApplication,
  })
  `;
  fs.writeFileSync('./dist/runtime.js', bundle);
}

main();
