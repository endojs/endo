// @ts-check
/* global process, harden */

import readline from 'readline';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

/**
 * Truncate a string to a maximum length, appending "..." if truncated.
 *
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
const truncate = (str, max) => {
  const oneLine = str.replace(/\n/g, '\\n');
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}...`;
};

/**
 * Create the TUI interface.
 *
 * @returns {object} TUI interface with prompt, display, and close methods
 */
export const createTUI = () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  let spinnerTimer = /** @type {ReturnType<typeof setInterval> | null} */ (null);
  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let spinnerIndex = 0;

  const startSpinner = () => {
    spinnerIndex = 0;
    spinnerTimer = setInterval(() => {
      const frame = spinnerFrames[spinnerIndex % spinnerFrames.length];
      process.stdout.write(`\r${DIM}${frame} thinking...${RESET}`);
      spinnerIndex += 1;
    }, 80);
  };

  const stopSpinner = () => {
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
      process.stdout.write('\r\x1b[K');
    }
  };

  /**
   * Prompt the user for input.
   *
   * @returns {Promise<string | null>} User input, or null on EOF/quit
   */
  const prompt = () =>
    new Promise(resolve => {
      rl.question(`${GREEN}> ${RESET}`, answer => {
        const trimmed = answer.trim();
        if (trimmed === '/quit' || trimmed === '/exit') {
          resolve(null);
          return;
        }
        resolve(trimmed);
      });
      rl.once('close', () => resolve(null));
    });

  /**
   * Display the assistant's final response.
   *
   * @param {string} text
   */
  const displayResponse = text => {
    stopSpinner();
    console.log(`\n${text}\n`);
  };

  /**
   * Display a tool call being made.
   *
   * @param {string} name
   * @param {Record<string, unknown>} args
   */
  const displayToolCall = (name, args) => {
    stopSpinner();
    const argsPreview = truncate(JSON.stringify(args), 120);
    console.log(`  ${CYAN}[${name}]${RESET} ${DIM}${argsPreview}${RESET}`);
    startSpinner();
  };

  /**
   * Display a tool result.
   *
   * @param {string} _name
   * @param {string} result
   */
  const displayToolResult = (_name, result) => {
    stopSpinner();
    const preview = truncate(result, 200);
    console.log(`  ${DIM}→ ${preview}${RESET}`);
    startSpinner();
  };

  /**
   * Display a tool error.
   *
   * @param {string} name
   * @param {string} error
   */
  const displayToolError = (name, error) => {
    stopSpinner();
    console.log(`  ${RED}✗ ${name}: ${error}${RESET}`);
    startSpinner();
  };

  /**
   * Display a status message.
   *
   * @param {string} text
   */
  const displayStatus = text => {
    console.log(`${YELLOW}${text}${RESET}`);
  };

  const close = () => {
    stopSpinner();
    rl.close();
  };

  return harden({
    prompt,
    displayResponse,
    displayToolCall,
    displayToolResult,
    displayToolError,
    displayStatus,
    startSpinner,
    stopSpinner,
    close,
  });
};
harden(createTUI);
