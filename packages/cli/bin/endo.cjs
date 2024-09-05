#!/usr/bin/env node
require('dotenv').config();
(async () => {
  const { main } = await import('../src/endo.js');
  await main(process.argv.slice(2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
