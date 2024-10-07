#!/usr/bin/env node
/* eslint-env node */

import * as fs from 'fs/promises';
import { parseArgs } from 'node:util';
import { convertJTDToPattern } from './jtd-to-pattern.js';

const main = async () => {
  const { values, positionals } = parseArgs({
    options: {
      output: {
        type: 'string',
        short: 'o',
      },
    },
    allowPositionals: true,
  });

  if (positionals.length < 1) {
    console.error('Usage: jtd-codegen <input-file> [-o <output-file>]');
    process.exit(1);
  }

  const inputFile = positionals[0];
  const outputFile = values.output;

  try {
    const jtdContent = await fs.readFile(inputFile, 'utf-8');
    const jtdSchema = JSON.parse(jtdContent);
    const pattern = convertJTDToPattern(jtdSchema);

    const output = JSON.stringify(pattern, null, 2);

    if (outputFile) {
      await fs.writeFile(outputFile, output);
      console.log(`Pattern written to ${outputFile}`);
    } else {
      console.log(output);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

main();
