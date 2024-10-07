#!/usr/bin/env node

import fs from 'fs';
import { convertJTDToPattern } from './jtd-to-pattern.js';

const main = () => {
  const [,, inputFile] = process.argv;

  if (!inputFile) {
    console.error('Usage: jtd-codegen <input-file>');
    process.exit(1);
  }

  try {
    const jtdContent = fs.readFileSync(inputFile, 'utf-8');
    const jtdSchema = JSON.parse(jtdContent);
    const pattern = convertJTDToPattern(jtdSchema);
    console.log(JSON.stringify(pattern, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

main();
