import OpenAI from 'openai';

/**
 * Extract JavaScript code from markdown code blocks.
 * Handles ```javascript, ```js, and plain ``` fences.
 *
 * @param {string} text
 * @returns {string} Extracted code or original text
 */
const extractCodeFromMarkdown = text => {
  // Match code blocks with optional language specifier
  const codeBlockRegex = /```(?:javascript|js)?\s*\n([\s\S]*?)\n```/;
  const match = text.match(codeBlockRegex);

  if (match) {
    return match[1].trim();
  }

  // If no code block found, return original text (might be plain code)
  return text.trim();
};

/**
 * LlmProvider wraps the OpenAI Responses API to generate JavaScript code.
 */
export class LlmProvider {
  /**
   * @param {object} options
   * @param {string} options.apiKey - OpenAI API key
   * @param {string} [options.model] - Model to use (default: 'gpt-5.1-codex-mini')
   * @param {number} [options.maxRetries] - Maximum number of retries on failure
   */
  constructor(options) {
    const {
      apiKey,
      model = 'gpt-5.1-codex-mini',
      maxRetries = 3,
    } = options || {};
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.client = new OpenAI({
      apiKey,
      maxRetries,
    });
    this.model = model;
  }

  /**
   * Generate JavaScript code from a prompt using the Responses API.
   *
   * @param {string} prompt - The prompt to send to the LLM
   * @returns {Promise<string>} - Generated JavaScript code
   */
  async generateCode(prompt) {
    console.log('prompt', prompt);
    // Use the Responses API
    const response = await this.client.responses.create({
      model: this.model,
      input: prompt,
    });

    try {
      // Extract the generated code from the response
      if (response && response.output && response.output.length > 0) {
        // Get the first output item
        const lastOutput = response.output[response.output.length - 1];
        // Handle message output with text content
        if (lastOutput.type === 'message' && lastOutput.content) {
          for (const content of lastOutput.content) {
            if (content.type === 'output_text' && content.text) {
              console.log('content.text', content.text);
              // Extract code from markdown code blocks if present
              return extractCodeFromMarkdown(content.text);
            }
          }
        }

        throw new Error('No text content found in LLM response');
      }

      throw new Error('No code generated from LLM response');
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new Error(
          `OpenAI API error: ${error.message} (status: ${error.status})`,
        );
      }
      throw error;
    }
  }
}
