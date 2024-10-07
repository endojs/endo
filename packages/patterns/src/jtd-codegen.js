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
#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs/promises';
import { convertJTDToPattern } from './jtd-to-pattern.js';

const main = async () => {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 <input-file> [options]')
    .positional('input-file', {
      describe: 'Path to the input JTD file',
      type: 'string',
    })
    .option('output', {
      alias: 'o',
      describe: 'Output file path',
      type: 'string',
    })
    .demandCommand(1)
    .help()
    .argv;

  try {
    const inputFile = argv._[0];
    const jtdContent = await fs.readFile(inputFile, 'utf-8');
    const jtdSchema = JSON.parse(jtdContent);
    const pattern = convertJTDToPattern(jtdSchema);
    
    const output = JSON.stringify(pattern, null, 2);
    
    if (argv.output) {
      await fs.writeFile(argv.output, output);
      console.log(`Pattern written to ${argv.output}`);
    } else {
      console.log(output);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

main();
