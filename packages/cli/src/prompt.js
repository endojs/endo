import { stdin, stdout } from 'process';
import readline from 'readline';

/**
 * Prompts the user for input. The answer is trimmed and converted to
 * lowercase.
 *
 * @param {string} question - The question to ask the user.
 * @returns {Promise<string>} The user's answer.
 */
export async function prompt(question) {
  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
  });

  return new Promise(resolve => {
    rl.question(`${question}\n`, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}
