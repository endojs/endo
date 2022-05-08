/* global process */
process.exitCode = 127;
lockdown({ unhandledRejectionTrapping: 'exit' });
