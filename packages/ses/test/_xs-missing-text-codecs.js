// @ts-nocheck
// XS smoke check for globals removed between importing SES and lockdown:
// compartments must receive the intrinsics collected during lockdown rather
// than the import-time globals.
// Lockdown happens once per realm, so this runs as its own xst script, bundled
// by ../scripts/generate-test-xs.js into ../tmp/test-xs-missing-text-codecs.js.

/* global globalThis, print */

// eslint-disable-next-line import/no-extraneous-dependencies
import 'ses';

delete globalThis.TextEncoder;
delete globalThis.TextDecoder;

assert.equal(typeof globalThis.TextEncoder, 'undefined', 'TextEncoder deleted');
assert.equal(typeof globalThis.TextDecoder, 'undefined', 'TextDecoder deleted');

lockdown();

print('# compartments observe the absence of the host text codecs');
{
  const compartment = new Compartment();
  assert.equal(
    compartment.evaluate('typeof TextEncoder'),
    'undefined',
    'compartment lacks TextEncoder',
  );
  assert.equal(
    compartment.evaluate('typeof TextDecoder'),
    'undefined',
    'compartment lacks TextDecoder',
  );
}
