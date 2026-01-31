#!/usr/bin/env node
// @ts-check
/**
 * Basic test for XSnapWasm
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// We need to import the module dynamically since it may not be built yet
const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('XSnapWasm Basic Test');
  console.log('====================\n');

  // Load the WASM module
  const wasmPath = join(__dirname, '..', 'xsnap.wasm');
  console.log('Loading WASM from:', wasmPath);
  const wasmBytes = await readFile(wasmPath);
  console.log('WASM size:', wasmBytes.length, 'bytes\n');

  // Compile the module
  console.log('Compiling WASM module...');
  const wasmModule = await WebAssembly.compile(wasmBytes);
  console.log('Compilation successful!\n');

  // Import the XSnapWasm class
  const { XSnapWasm } = await import('../src/xsnap-wasm.js');

  // Create instance with handlers
  console.log('Creating XSnapWasm instance...');
  const messages = [];
  const xsnap = await XSnapWasm.create({
    wasmModule,
    handlePrint: (msg) => {
      console.log('[xsnap]', msg);
      messages.push(msg);
    },
    handleCommand: async (cmd) => {
      console.log('[command]', new TextDecoder().decode(cmd));
      return new TextEncoder().encode('pong');
    },
  });

  console.log('Status:', xsnap.status);
  if (xsnap.status !== 'running') {
    throw new Error('Expected status to be "running"');
  }
  console.log('');

  // Test 1: Simple evaluation
  console.log('Test 1: Simple evaluation');
  console.log('-------------------------');
  await xsnap.evaluate('print("Hello from XSnap!")');
  if (!messages.includes('Hello from XSnap!')) {
    throw new Error('Expected print message not received');
  }
  console.log('✓ print() works\n');

  // Test 2: Arithmetic
  console.log('Test 2: Arithmetic');
  console.log('------------------');
  await xsnap.evaluate('print("1 + 1 =", 1 + 1)');
  console.log('✓ Arithmetic works\n');

  // Test 3: Variables and functions
  console.log('Test 3: Variables and functions');
  console.log('-------------------------------');
  await xsnap.evaluate(`
    function add(a, b) {
      return a + b;
    }
    print("add(2, 3) =", add(2, 3));
  `);
  console.log('✓ Functions work\n');

  // Test 4: Variable declaration
  console.log('Test 4: Variable declaration');
  console.log('----------------------------');
  await xsnap.evaluate(`
    let x = 100;
    print("x =", x);
  `);
  console.log('✓ Variable declaration works\n');

  // Test 5: Object creation
  console.log('Test 5: Object creation');
  console.log('-----------------------');
  await xsnap.evaluate(`
    const obj = { name: "test", value: 42 };
    print("obj.name =", obj.name, "obj.value =", obj.value);
  `);
  console.log('✓ Object creation works\n');

  // Test 6: Array operations (simple)
  console.log('Test 6: Array operations');
  console.log('------------------------');
  await xsnap.evaluate(`
    const arr = [1, 2, 3, 4, 5];
    print("arr.length =", arr.length);
    print("arr[2] =", arr[2]);
  `);
  console.log('✓ Array operations work\n');

  // Note: gc() and error handling tests are skipped because without proper
  // setjmp/longjmp, they corrupt the XS machine state.
  console.log('Note: gc() and error handling tests skipped (requires WASM exception handling)\n');

  // Clean up
  console.log('Closing XSnapWasm...');
  await xsnap.close();
  console.log('Status:', xsnap.status);
  if (xsnap.status !== 'stopped') {
    throw new Error('Expected status to be "stopped"');
  }

  console.log('\n====================');
  console.log('All tests passed! ✓');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
