/* global process */
// @ts-ignore Yes, we can assign to exitCode, typedoc.
process.exitCode = 127;
lockdown({ errorTrapping: 'exit' });
