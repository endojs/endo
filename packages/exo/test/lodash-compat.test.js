import test from '@endo/ses-ava/prepare-endo.js';
import _ from 'lodash';

// See https://github.com/Agoric/agoric-sdk/discussions/9986
test('lodash compat', t => {
  console.log('test lodash', _.defaults({ a: 1 }, { a: 3, b: 2 }));
  t.pass('seems to work');
});
