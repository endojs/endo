/* eslint-disable no-undef */
import '@endo/init';
import fs from 'fs/promises';
import path from 'path';
import {
  AgentCapability,
  createResultResolverCapability,
} from './agent-capability.js';

/**
 * Agent orchestrates LLM code generation and execution in SES compartments.
 */
export class Agent {
  /**
   * @param {object} options
   * @param {import('./llm-provider.js').LlmProvider} options.llmProvider - LLM provider instance
   * @param {Array<AgentCapability>} [options.capabilities] - Array of capabilities to expose to the compartment
   * @param {object} [options.tools] - (Legacy) Additional tools to expose to the compartment
   * @param {string} [options.debugLogDirectory] - Directory to write debug logs (one file per attempt)
   */
  constructor(options) {
    const { llmProvider, capabilities = [], tools, debugLogDirectory } =
      options || {};
    if (!llmProvider) {
      throw new Error('llmProvider is required');
    }
    this.llmProvider = llmProvider;
    this.debugLogDirectory = debugLogDirectory;

    // Support legacy tools object or new capabilities array
    if (tools && Object.keys(tools).length > 0) {
      // Convert legacy tools to capabilities
      this.capabilities = Object.entries(tools).map(
        ([name, value]) =>
          new AgentCapability({
            name,
            value,
            description: `Tool: ${name}`,
          }),
      );
    } else {
      this.capabilities = capabilities;
    }
  }

  /**
   * Write debug log for an attempt.
   *
   * @param {number} attempt - The attempt number
   * @param {string} prompt - The full prompt sent to LLM
   * @param {string} response - The response text from LLM (after extraction)
   * @param {string} [error] - Optional error if attempt failed
   */
  async writeDebugLog(attempt, prompt, response, error) {
    if (!this.debugLogDirectory) {
      return;
    }

    try {
      // Ensure debug directory exists
      await fs.mkdir(this.debugLogDirectory, { recursive: true });

      const timestamp = new Date().toISOString();
      const logContent = {
        attempt,
        timestamp,
        prompt,
        response,
        error: error || null,
      };

      const filename = path.join(
        this.debugLogDirectory,
        `attempt-${attempt}.json`,
      );
      await fs.writeFile(filename, JSON.stringify(logContent, null, 2), 'utf8');
    } catch (writeError) {
      // Don't fail the query if logging fails
      console.error(`Failed to write debug log: ${writeError.message}`);
    }
  }

  /**
   * Generate enhanced prompt with capability descriptions.
   *
   * @param {string} userPrompt - The user's prompt
   * @param {Array<AgentCapability>} allCapabilities - All capabilities available
   * @param {number} [currentAttempt] - Current attempt number
   * @param {number} [maxAttempts] - Maximum number of attempts
   * @returns {string} Enhanced prompt
   */
  // eslint-disable-next-line class-methods-use-this
  generateEnhancedPrompt(userPrompt, allCapabilities, currentAttempt, maxAttempts) {
    const capabilityDescriptions = allCapabilities
      .map(cap => cap.toPromptText())
      .join('\n');

    const isLastAttempt = currentAttempt && maxAttempts && currentAttempt >= maxAttempts;
    const lastAttemptWarning = isLastAttempt
      ? `
⚠️  FINAL ITERATION ${currentAttempt}/${maxAttempts} ⚠️
This is your LAST attempt. You MUST call resultResolver.resolve() or resultResolver.reject() in this iteration.
Provide the best answer you can based on what you've learned so far.
`
      : '';

    return `
IMPORTANT: You MUST respond with ONLY executable JavaScript code. Do NOT include explanations, comments, or natural language.

You are a MULTI-ITERATION code evaluation agent. Generate JavaScript code to solve the task below.
${lastAttemptWarning}

Available capabilities:
${capabilityDescriptions}

Task: ${userPrompt}

CRITICAL RULES:
1. Output ONLY JavaScript code (no explanations, no markdown except code fences)
2. You CAN use top-level await - the code runs in an async context
3. You CANNOT import modules (import/require are not available)
4. DO NOT try to answer in one iteration - explore the codebase across multiple iterations
5. Use console.log to investigate and understand what you find
6. resultResolver.resolve(answer) means "I have the FINAL ANSWER to the user's question"
   - The value MUST be the actual answer to the user's query, NOT a status message
   - ONLY call this when you have thoroughly explored and know the complete answer
   - DO NOT call resolve('iteration complete') or resolve('continue exploring')
7. If you're still exploring and need more information, DON'T call resultResolver at all
   - Just log what you found and the code will run again in the next iteration
8. If the task is impossible, call resultResolver.reject(error) with an explanation

WORKFLOW - Take multiple iterations:

ITERATION 1: Explore and log findings (NO RESOLVE)
\`\`\`javascript
const files = await listFiles('.');
console.log('Found', files.length, 'files');
console.log('File names:', files.map(f => f.name));
// DON'T call resultResolver.resolve() - we're just exploring!
// Code ends here and will run again automatically
\`\`\`

ITERATION 2: Dig deeper based on what you found (NO RESOLVE)
\`\`\`javascript
const files = await listFiles('.');
const jsFiles = files.filter(f => f.name.endsWith('.js'));
console.log('Found', jsFiles.length, 'JS files');

// Read a key file to learn more
const pkg = await readFile('package.json');
console.log('Package info:', pkg);
// Still DON'T call resultResolver - need to analyze more
// Code ends here and will run again automatically
\`\`\`

ITERATION 3+: Only NOW resolve with the FINAL ANSWER
\`\`\`javascript
// After several iterations of exploring...
const pkg = JSON.parse(await readFile('package.json'));
const readme = await readFile('README.md');

// NOW we know the answer - resolve with human-readable answer
const answer = 'This is a ' + pkg.description + ' application. It has ' + Object.keys(pkg.dependencies || {}).length + ' dependencies and is used for ' + pkg.description;
resultResolver.resolve(answer); // <-- FINAL ANSWER to user's question
\`\`\`

WRONG - Don't do this:
\`\`\`javascript
console.log('Files:', files);
resultResolver.resolve('Iteration complete'); // ❌ This is NOT the final answer!
\`\`\`

ERROR HANDLING:
\`\`\`javascript
try {
  const content = await readFile('missing.txt');
} catch (error) {
  console.log('File not found, trying alternative...');
  // Continue exploring, don't reject immediately
}
\`\`\`

Now generate JavaScript code for ITERATION 1 of the task above:
`;
  }

  /**
   * Execute a query by generating and evaluating JavaScript code.
   * Retries on evaluation errors with feedback to the LLM.
   *
   * @param {string} prompt - The prompt to send to the LLM
   * @param {number} [maxAttempts] - Maximum number of retry attempts (default: 20)
   * @returns {Promise<any>} - The result from the evaluated code
   */
  async query(prompt, maxAttempts = 20) {
    const allLogs = [];
    const allErrors = [];
    const attempts = [];

    // Combine resultResolver with user capabilities
    const allCapabilities = [
      // resultResolver will be added per attempt
      ...this.capabilities,
    ];

    let currentPrompt = this.generateEnhancedPrompt(
      prompt,
      [
        // Placeholder for structure
        new AgentCapability({
          name: 'resultResolver',
          value: {},
          description:
            'Object with resolve(value) and reject(error) methods to complete the query',
        }),
        ...allCapabilities,
      ],
      1,
      maxAttempts,
    );

    // eslint-disable-next-line no-await-in-loop
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptLogs = [];
      const attemptErrors = [];

      // Create result promise for this attempt
      let resolveResult;
      let rejectResult;
      let resultResolved = false;
      const resultPromise = new Promise((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      });

      // Create resultResolver capability with logging
      const resultResolverCapability = createResultResolverCapability(
        value => {
          attemptLogs.push(
            `[resultResolver] Resolved with: ${JSON.stringify(value)}`,
          );
          resultResolved = true;
          resolveResult(value);
        },
        error => {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          attemptErrors.push(`[resultResolver] Rejected with: ${errorMsg}`);
          resultResolved = true;
          rejectResult(new Error(errorMsg));
        },
      );

      // Create console capability to capture logs
      const consoleCapability = new AgentCapability({
        name: 'console',
        value: {
          log: (...args) => {
            attemptLogs.push(
              `[console.log] ${args.map(a => String(a)).join(' ')}`,
            );
          },
          error: (...args) => {
            attemptErrors.push(
              `[console.error] ${args.map(a => String(a)).join(' ')}`,
            );
          },
          warn: (...args) => {
            attemptLogs.push(
              `[console.warn] ${args.map(a => String(a)).join(' ')}`,
            );
          },
          info: (...args) => {
            attemptLogs.push(
              `[console.info] ${args.map(a => String(a)).join(' ')}`,
            );
          },
        },
        description:
          'Console for logging output (log, error, warn, info methods)',
      });

      try {
        // Generate code from LLM
        // eslint-disable-next-line no-await-in-loop
        const code = await this.llmProvider.generateCode(currentPrompt);

        // Write debug log for this attempt
        // eslint-disable-next-line no-await-in-loop
        await this.writeDebugLog(attempt, currentPrompt, code);

        // Build endowments object from all capabilities
        const endowments = {};
        for (const capability of [
          resultResolverCapability,
          ...allCapabilities,
          consoleCapability,
        ]) {
          endowments[capability.name] = capability.value;
        }

        // Create compartment with endowments
        const compartment = new Compartment(endowments);

        // Wrap code in async function to support top-level await
        const wrappedCode = `(async () => {
${code}
})()`;

        // Evaluate the code in the compartment
        let evalError = null;
        try {
          const evalResult = compartment.evaluate(wrappedCode);
          // If the evaluation returns a promise, await it
          if (evalResult && typeof evalResult.then === 'function') {
            // eslint-disable-next-line no-await-in-loop
            await evalResult;
          }
        } catch (error) {
          evalError = error;
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          attemptErrors.push(`[evaluation] ${errorMsg}`);
        }

        // Record attempt
        attempts.push({
          attempt,
          code,
          logs: [...attemptLogs],
          errors: [...attemptErrors],
          evalError: evalError ? String(evalError) : null,
        });

        allLogs.push(...attemptLogs);
        allErrors.push(...attemptErrors);

        // If there was an evaluation error, retry with feedback
        if (evalError && attempt < maxAttempts) {
          const errorMsg =
            evalError instanceof Error ? evalError.message : String(evalError);
          // Update debug log with error
          // eslint-disable-next-line no-await-in-loop
          await this.writeDebugLog(attempt, currentPrompt, code, errorMsg);
          
          const isNextAttemptLast = attempt + 1 === maxAttempts;
          const finalAttemptWarning = isNextAttemptLast
            ? `\n\n⚠️  WARNING: This is your FINAL attempt (${attempt + 1}/${maxAttempts}). You MUST call resultResolver.resolve() or resultResolver.reject() in the next response.\n`
            : '';
          
          const logsOutput = attemptLogs.length > 0
            ? `\n\nConsole output before error:\n${attemptLogs.join('\n')}`
            : '';
          
          currentPrompt = `${currentPrompt}

---
PREVIOUS ATTEMPT ${attempt} FAILED:

Code that was executed:
\`\`\`javascript
${code}
\`\`\`
${logsOutput}

Error encountered:
${errorMsg}
${finalAttemptWarning}
Please analyze the error and generate corrected code. Remember to use the available capabilities and call resultResolver.resolve() or resultResolver.reject() when done.
`;
          // eslint-disable-next-line no-continue
          continue;
        }

        // Wait for the result (with timeout to prevent hanging)
        if (!resultResolved) {
          // Give some time for async operations
          // eslint-disable-next-line no-await-in-loop
          await Promise.race([
            resultPromise,
            new Promise(resolve =>
              // eslint-disable-next-line no-undef
              globalThis.setTimeout(() => resolve({ timeout: true }), 5000),
            ),
          ]);
        }

        if (resultResolved) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const result = await resultPromise;
            return {
              success: true,
              result,
              logs: allLogs,
              errors: allErrors,
              attempts,
              code,
            };
          } catch (resolverError) {
            // resultResolver.reject was called
            if (attempt < maxAttempts) {
              const errorMsg =
                resolverError instanceof Error
                  ? resolverError.message
                  : String(resolverError);
              
              const isNextAttemptLast = attempt + 1 === maxAttempts;
              const finalAttemptWarning = isNextAttemptLast
                ? `\n\n⚠️  WARNING: This is your FINAL attempt (${attempt + 1}/${maxAttempts}). You MUST call resultResolver.resolve() or resultResolver.reject() in the next response.\n`
                : '';
              
              const logsOutput = attemptLogs.length > 0
                ? `\n\nConsole output from this attempt:\n${attemptLogs.join('\n')}`
                : '';
              
              currentPrompt = `${currentPrompt}

---
PREVIOUS ATTEMPT ${attempt} REJECTED:

Code that was executed:
\`\`\`javascript
${code}
\`\`\`
${logsOutput}

Rejection reason:
${errorMsg}
${finalAttemptWarning}
Please analyze why the task was rejected and try a different approach.
`;
              // eslint-disable-next-line no-continue
              continue;
            }
            throw resolverError;
          }
        }

        // If we get here, resultResolver was never called
        if (attempt < maxAttempts) {
          const isNextAttemptLast = attempt + 1 === maxAttempts;
          const finalAttemptWarning = isNextAttemptLast
            ? `\n\n⚠️  WARNING: This is your FINAL attempt (${attempt + 1}/${maxAttempts}). You MUST call resultResolver.resolve() or resultResolver.reject() in the next response.\n`
            : '';
          
          const logsOutput = attemptLogs.length > 0
            ? `\n\nConsole output from this attempt:\n${attemptLogs.join('\n')}`
            : '';
          
          const errorsOutput = attemptErrors.length > 0
            ? `\n\nErrors from this attempt:\n${attemptErrors.join('\n')}`
            : '';
          
          currentPrompt = `${currentPrompt}

---
PREVIOUS ATTEMPT ${attempt} INCOMPLETE:

Code that was executed:
\`\`\`javascript
${code}
\`\`\`
${logsOutput}${errorsOutput}

The code executed but resultResolver.resolve() or resultResolver.reject() was never called.
This is normal for exploration - you can see the output above.
Based on what you learned, continue investigating or provide the final answer.
${finalAttemptWarning}`;
          // eslint-disable-next-line no-continue
          continue;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        allErrors.push(`[agent] Attempt ${attempt}: ${errorMsg}`);

        if (attempt < maxAttempts) {
          const isNextAttemptLast = attempt + 1 === maxAttempts;
          const finalAttemptWarning = isNextAttemptLast
            ? `\n\n⚠️  WARNING: This is your FINAL attempt (${attempt + 1}/${maxAttempts}). You MUST call resultResolver.resolve() or resultResolver.reject() in the next response.\n`
            : '';
          
          const logsOutput = attemptLogs.length > 0
            ? `\n\nConsole output before error:\n${attemptLogs.join('\n')}`
            : '';
          
          currentPrompt = `${currentPrompt}

---
PREVIOUS ATTEMPT ${attempt} ERROR:
${errorMsg}
${logsOutput}
${finalAttemptWarning}
Please try again with a different approach.
`;
          // eslint-disable-next-line no-continue
          continue;
        }

        return {
          success: false,
          error: errorMsg,
          logs: allLogs,
          errors: allErrors,
          attempts,
          code: null,
        };
      }
    }

    // Exhausted all attempts
    return {
      success: false,
      error: `Failed after ${maxAttempts} attempts`,
      logs: allLogs,
      errors: allErrors,
      attempts,
      code: null,
    };
  }
}
