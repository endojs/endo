#!/usr/bin/env zx
/**
 * @file Rename files used in tests that aren't tests themselves.
 *
 * This puts an underscore prefix on all files that aren't tests so that Ava's
 * default glob won't try to run them.
 *
 * It also updates `import` lines, but misses `new URL()` calls which Endo tests
 * often use. We dropped the goal of fully migrating to `_` so didn't put more
 * time into this script, but it's here for reference.
 */
const fsp = require('fs').promises;
const path = require('path');

// Function to handle renaming and updating imports
async function processFile(filename) {
  const fileDir = path.dirname(filename);
  const baseName = path.basename(filename);
  const newFileName = `_${baseName}`;

  const oldFilePath = path.join(fileDir, baseName);
  const newFilePath = path.join(fileDir, newFileName);

  // Rename the file by prepending '_'
  await fsp.rename(oldFilePath, newFilePath);

  // Read all the files in the directory
  const files = await fsp.readdir(fileDir);

  // Loop through each file in the directory
  for (const file of files) {
    const filePath = path.join(fileDir, file);

    // Check if the file is a .js file and not the renamed file
    if (file !== newFileName && path.extname(file) === '.js') {
      // Read the content of the file
      let content = await fsp.readFile(filePath, 'utf8');

      // Use a regex to update the import path from the original file to the new file
      const regex = new RegExp(`(['"\`])\\./${baseName}\\1`, 'g');
      content = content.replace(regex, `$1./_${baseName}$1`);

      // Write the updated content back to the file
      await fsp.writeFile(filePath, content, 'utf8');
    }
  }
}

// Read filenames from stdin
(async () => {
  const stdin = process.stdin;
  stdin.setEncoding('utf8');

  let inputData = '';

  // Collect all data from stdin
  stdin.on('data', chunk => {
    inputData += chunk;
  });

  stdin.on('end', async () => {
    // Split input into lines (each line represents a filename)
    const filenames = inputData.split('\n').filter(Boolean);

    // Process each file
    for (const filename of filenames) {
      await processFile(filename);
    }
  });
})();
