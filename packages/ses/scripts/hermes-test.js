#!/usr/bin/env node
/* global process */

import { existsSync, writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';

// Utility function to determine OS-specific directory and create Hermes runner
function createHermesRunner() {
  const platform = os.platform();
  let osDir;

  switch (platform) {
    case 'linux':
      osDir = 'linux64-bin';
      break;
    case 'darwin':
      osDir = 'osx-bin';
      break;
    case 'win32':
      osDir = 'win64-bin';
      break;
    default:
      throw new Error(`Unsupported OS: ${platform}`);
  }

  const hermesc = path.join(
    '..',
    '..',
    'node_modules',
    'hermes-engine-cli',
    osDir,
    'hermesc',
  );
  const hermes = path.join(
    '..',
    '..',
    'node_modules',
    'hermes-engine-cli',
    osDir,
    'hermes',
  );

  // Add .exe extension for Windows
  const hermescPath = platform === 'win32' ? `${hermesc}.exe` : hermesc;
  const hermesPath = platform === 'win32' ? `${hermes}.exe` : hermes;

  return {
    version: () => {
      execSync(`"${hermesPath}" --version`, {
        stdio: 'inherit',
      });
    },
    run: jsFile => {
      const hbcFile = jsFile.replace(/\.js$/, '.hbc');

      // Compile
      try {
        execSync(
          `"${hermescPath}" "${jsFile}" -emit-binary -out "${hbcFile}"`,
          {
            stdio: 'pipe', // Capture output to detect compilation errors
          },
        );
      } catch (error) {
        throw new Error(`Compilation error: ${error.message}`);
      }

      // Execute
      execSync(`"${hermesPath}" -b "${hbcFile}"`, {
        stdio: 'inherit',
      });
    },
  };
}

const hermesPrefixSES = readFileSync(
  path.join(import.meta.dirname, '..', 'dist', 'ses-hermes.cjs'),
  'utf8',
);
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'hermes-test-'));

const prepareTestFile = testFile => {
  const testName = path.basename(testFile);
  const distFile = path.join(tempDir, `${testName}`);

  const testContent = readFileSync(testFile, 'utf8');
  // Combine the code in a way that line numbers are preserved and therefore helpful
  const combined = `${testContent}
;;;;
${hermesPrefixSES}
;;;;

var TEST;
function test(name, fn) {
  TEST={fn, name}
}
try {
  TEST.fn()
} catch(e) {
  print(e.message)
  print('  ✗ '+TEST.name)
  throw e
}
print('  ✓ '+TEST.name)

;;;; 
`;
  writeFileSync(distFile, combined);
  return distFile;
};

function run() {
  const testFiles = process.argv.slice(2);

  if (testFiles.length === 0) {
    console.error('Usage: hermes-test.js <test-file1> <test-file2> ...');
    process.exit(2);
  }

  // Validate that all test files exist
  testFiles.forEach(file => {
    if (!existsSync(file)) {
      console.error(`Error: Test file not found: ${file}`);
      process.exit(3);
    }
  });

  const hermes = createHermesRunner();
  let passed = 0;
  let failed = 0;

  hermes.version();

  // Run each test in a separate clean environment
  testFiles.forEach(testFile => {
    console.log(`\n[RUN] ${testFile}`);

    try {
      hermes.run(prepareTestFile(testFile));
      passed += 1;
    } catch (error) {
      failed += 1;
    }
  });

  // Summary
  console.log(`  -

  ${passed} tests passed`);

  if (failed > 0) {
    console.log(`  ${failed} tests failed`);
    process.exit(1);
  }
}

run();
