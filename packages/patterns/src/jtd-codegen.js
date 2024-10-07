#!/usr/bin/env node
/* eslint-env node */

import * as fs from 'fs/promises';
import { convertJTDToPattern } from './jtd-to-pattern.js';

const main = async () => {
  const args = process.argv.slice(2);
  let outputFile;

  if (args.length < 1) {
    console.error('Usage: jtd-codegen <input-file> [-o <output-file>]');
    process.exit(1);
  }

  const inputFile = args[0];
  const outputIndex = args.indexOf('-o');
  if (outputIndex !== -1 && args[outputIndex + 1]) {
    outputFile = args[outputIndex + 1];
  }

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
