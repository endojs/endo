// Ensure endo is initialized synchronously.
import '@endo/init/legacy.js';

// Asynchronously run the exported main function.
import './endo-exec.cjs';

/**
 * @typedef {(
 *  argv: string[],
 *  envp: Record<string, string>,
 *  powers: Record<string, any>,
 * ) => Promise<any>} Main
 */
