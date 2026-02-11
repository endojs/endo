// This file demonstrates and tests expected usage of evasive-transform

import 'ses';
import test from 'ava';
// eslint-disable-next-line import/no-extraneous-dependencies
import { evadeCensor, evadeCensorSync } from '@endo/evasive-transform';
import { loadLocation, importLocation } from '../src/import.js';

/**
 * Creates a fake read function that returns synthetic module content.
 *
 * @param {Record<string, string>} files - Map of file paths to content
 * @returns {import('../src/types.js').ReadFn}
 */
const makeFakeRead = files => {
  return async location => {
    const pathname = new URL(location).pathname;
    for (const [path, content] of Object.entries(files)) {
      if (pathname.endsWith(path)) {
        return new TextEncoder().encode(content);
      }
    }
    const err = new Error(`File not found: ${location}`);
    /** @type {any} */ (err).code = 'ENOENT';
    throw err;
  };
};

const sourceWithHtmlComment = `
// This module contains an unintended HTML comment

let a = 10;
let b = 0;
while (a--> 0) {
  b +=1;
}
const f = new Function('var a=10; if(a-->0){}');
f();
`;

const fakeRead = makeFakeRead({
  '/node_modules/test-pkg/index.js': sourceWithHtmlComment,
  '/node_modules/test-pkg/package.json': JSON.stringify({
    name: 'test-pkg',
    version: '1.0.0',
    type: 'module',
  }),
});

test('baseline - HTML comments in source fail without evasive transforms', async t => {
  const fixture = 'file:///node_modules/test-pkg/index.js';

  // This should FAIL because compartment-mapper does not apply evasive transforms by default
  const application = await loadLocation(fakeRead, fixture);
  await t.throwsAsync(
    async () => application.import(),
    { message: /SES_HTML_COMMENT_REJECTED/ },
    'Without evasive transforms, HTML comments in source cause SES rejection',
  );
});

test('moduleTransforms - evasive transforms handle HTML comments when applied', async t => {
  const fixture = 'file:///node_modules/test-pkg/index.js';

  await t.notThrowsAsync(async () => {
    await importLocation(fakeRead, fixture, {
      moduleTransforms: {
        async mjs(sourceBytes, specifier, location, packageLocation, options) {
          const source = new TextDecoder().decode(sourceBytes);
          // Apply evasive transforms to handle the HTML comment
          const { code } = await evadeCensor(source, {
            sourceType: 'module',
            sourceUrl: location,
          });
          const objectBytes = new TextEncoder().encode(code);
          return { bytes: objectBytes, parser: 'mjs' };
        },
      },
      transforms: [
        source =>
          evadeCensorSync(source, {
            sourceType: 'module',
          }).code,
      ],
    });
  });
});
