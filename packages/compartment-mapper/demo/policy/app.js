// @ts-nocheck
/* global require Buffer module */
require('@endo/compartment-mapper-demo-polyfill1');
const Poet = require('entropoetry');
const fs = require('fs');

// eslint-disable-next-line no-undef
console.log({ answerPolyfill });

fs.existsSync('/notthere');

const p = new Poet();

const key = Buffer.from(
  '1cd543bb7110a3a2ec49cbe0eb321232622f6b3d2abaec57466bae0b4085c9c8',
  'hex',
);

module.exports = { poem: p.stringify(key) };

require('dotenv').config();

// console.log(require('@endo/compartment-mapper-demo-policy-attenuator1'));
