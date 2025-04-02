// // @ts-check

// import test from 'ava';
// import { makeSyrupReader } from '../src/decode.js';
// import { readOCapDescriptor, readOCapNMessage } from '../src/ocapn.js';
// import { descriptorsTable, operationsTable } from './_ocapn.js';

// test('affirmative descriptor read cases', t => {
//   for (const { syrup, value } of descriptorsTable) {
//     // We test with a length guess of 1 to maximize the probability
//     // of discovering a fault in the buffer resize code.
//     const bytes = new Uint8Array(syrup.length);
//     for (let i = 0; i < syrup.length; i += 1) {
//       bytes[i] = syrup.charCodeAt(i);
//     }
//     const syrupReader = makeSyrupReader(bytes, { name: syrup });
//     let descriptor;
//     t.notThrows(() => {
//       descriptor = readOCapDescriptor(syrupReader);
//     }, `for ${JSON.stringify(syrup)}`);
//     t.deepEqual(descriptor, value, `for ${JSON.stringify(syrup)}`);
//   }
// });

// test('affirmative operation read cases', t => {
//   for (const { syrup, value } of operationsTable) {
//     const bytes = new Uint8Array(syrup.length);
//     for (let i = 0; i < syrup.length; i += 1) {
//       bytes[i] = syrup.charCodeAt(i);
//     }
//     const syrupReader = makeSyrupReader(bytes);
//     const message = readOCapNMessage(syrupReader);
//     t.deepEqual(message, value, `for ${JSON.stringify(syrup)}`);
//   }
// });
