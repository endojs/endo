#!/usr/bin/env zx
/* eslint-disable @jessie.js/safe-await-separator */
// @ts-nocheck typecheck would require a package.json with zx
/* global chalk, fs, $ -- provided by zx */

/**
 * Migrate Ava test names from the "test-foo.js" scheme to "foo.test.js" that is the default in Ava.
 *
 * Motivations
 * 1. It aligns with the prevailing use of Ava, the test runner we use and recommand.
 *    Customizing tool defaults should have a high bar because of the maintenance
 *    cost they incur. We keep the `files` config explicit for clarity and linter tooling.
 * 2. The naming scheme chosen puts "test" at the front of what is obviously a
 *    test from its path context. To run a particular test from the CLI requires
 *    typing "test" three time to pick one: yarn test test/test-something.js.
 *    With Ava's default it would be yarn test test/something.test.js and typing
 *    the "so" can autocomplete.
 */

const usage = `
Run this script in a package to convert its test names and Ava config.

To run it over all packages,
  yarn workspaces foreach --all exec '../../scripts/migrate-test-names.mjs'
Then for the couple deeper packages
  yarn workspaces foreach --all exec '../../../scripts/migrate-test-names.mjs'

`;

const packageObj = fs.readJsonSync('package.json');
console.log(`${chalk.bold(`Migrating test names: ${packageObj.name}`)}\n`);
console.log(chalk.blue("Updates 'files' glob in package’s Ava config"));
if (packageObj.ava) {
  // For now allow both the old and new globs
  packageObj.ava.files = ['test/**/test-*.*', 'test/**/*.test.*'];
}
fs.writeJsonSync('package.json', packageObj, { spaces: 2 });

console.log(chalk.blue('Moving test files'));
const { stdout: testFiles } = await $`find test -name 'test-*.*' || true`;
const filenames = testFiles.split('\n').filter(Boolean);

if (filenames.length === 0) {
  console.log(chalk.red('No test files found.'));
  console.log('Maybe the migration is already done. To roll back:');
  console.log(' git reset . && git checkout . && git clean -f');
}

for (const oldname of filenames) {
  const newname = oldname
    .replace('test-', '')
    .replace('.js', '.test.js')
    .replace('.ts', '.test.ts');
  await $`git mv ${oldname} ${newname}`;
}

console.log(chalk.blue('Committing changes'));
await $`git add .`;
await $`git commit -m "chore: test glob to Ava default"`;

console.log('✅');
