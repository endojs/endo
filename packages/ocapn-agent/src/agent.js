import '@endo/init';

/**
 * Agent orchestrates LLM code generation and execution in SES compartments.
 */
export class Agent {
  /**
   * @param {object} options
   * @param {import('./llm-provider.js').LlmProvider} options.llmProvider - LLM provider instance
   * @param {object} [options.tools] - Additional tools to expose to the compartment
   */
  constructor(options) {
    const { llmProvider, tools = {} } = options || {};
    if (!llmProvider) {
      throw new Error('llmProvider is required');
    }
    this.llmProvider = llmProvider;
    this.tools = tools;
  }

  /**
   * Execute a query by generating and evaluating JavaScript code.
   *
   * @param {string} prompt - The prompt to send to the LLM
   * @returns {Promise<any>} - The result from the evaluated code
   */
  async query(prompt) {
    const logs = [];
    const errors = [];

    // Enhance the prompt to request JavaScript code generation
    const enhancedPrompt = `${prompt}

Generate JavaScript code that solves the above task. The code should use the resultResolver object to complete:
- Call resultResolver.resolve(value) to return a successful result
- Call resultResolver.reject(error) to indicate failure
The code will be executed in a JavaScript environment with access to the resultResolver object and any additional tools provided.`;

    // Generate code from LLM
    const code = await this.llmProvider.generateCode(enhancedPrompt);

    try {
      // Create result promise
      let resolveResult;
      let rejectResult;
      const resultPromise = new Promise((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      });

      // Create resultResolver endowment
      const resultResolver = {
        resolve: value => {
          logs.push(`[resultResolver] Resolved with: ${JSON.stringify(value)}`);
          resolveResult(value);
        },
        reject: error => {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          errors.push(`[resultResolver] Rejected with: ${errorMsg}`);
          rejectResult(new Error(errorMsg));
        },
      };

      // Create console endowment to capture logs
      const console = {
        log: (...args) => {
          logs.push(`[console.log] ${args.map(a => String(a)).join(' ')}`);
        },
        error: (...args) => {
          errors.push(`[console.error] ${args.map(a => String(a)).join(' ')}`);
        },
        warn: (...args) => {
          logs.push(`[console.warn] ${args.map(a => String(a)).join(' ')}`);
        },
        info: (...args) => {
          logs.push(`[console.info] ${args.map(a => String(a)).join(' ')}`);
        },
      };

      // Create compartment with endowments
      const compartment = new Compartment({
        resultResolver,
        console,
        ...this.tools,
      });

      // Evaluate the code in the compartment
      try {
        compartment.evaluate(code);
      } catch (evalError) {
        const errorMsg =
          evalError instanceof Error ? evalError.message : String(evalError);
        errors.push(`[evaluation] ${errorMsg}`);
        throw new Error(`Code evaluation failed: ${errorMsg}`);
      }

      // Wait for the result
      const result = await resultPromise;
      return {
        success: true,
        result,
        logs,
        errors,
        code,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`[agent] ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
        logs,
        errors,
        code: null,
      };
    }
  }
}
