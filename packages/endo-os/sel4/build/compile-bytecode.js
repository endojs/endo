// Compile daemon-bundle-qjsc.js to bytecode using QuickJS itself.
// This runs IN QuickJS, so it has full JS support.
//
// Usage: qjs compile-bytecode.js
// Output: daemon-bytecode.bin (raw bytecode)

import * as std from 'std';

const source = std.loadFile('daemon-bundle-qjsc.js');
if (!source) {
    print('ERROR: Cannot read daemon-bundle-qjsc.js');
    std.exit(1);
}

print('Compiling ' + source.length + ' bytes to bytecode...');

// JS_Eval with JS_EVAL_FLAG_COMPILE_ONLY compiles without executing.
// In the JS API, we use the scriptArgs approach or std.evalScript.
// Actually, the simplest way is to use the qjsc -b flag for raw bytecode.

// Alternative: just write the source to stdout for qjsc -b
print('Source loaded, ' + source.length + ' chars');
