/**
 * @typedef {object} AgentCapabilityOptions
 * @property {string} name - The name/identifier for this capability
 * @property {any} value - The actual value (function, object, etc.) to expose
 * @property {string} description - Human-readable description of what this capability does
 * @property {object} [typeInfo] - Optional type information (for future use)
 */

/**
 * AgentCapability represents a capability (function, object, or value)
 * that can be exposed to the SES compartment.
 */
export class AgentCapability {
  /**
   * @param {AgentCapabilityOptions} options
   */
  constructor({ name, value, description, typeInfo }) {
    if (!name) {
      throw new Error('AgentCapability requires a name');
    }
    if (value === undefined) {
      throw new Error('AgentCapability requires a value');
    }
    if (!description) {
      throw new Error('AgentCapability requires a description');
    }

    this.name = name;
    this.value = value;
    this.description = description;
    this.typeInfo = typeInfo;
  }

  /**
   * Generate a text description suitable for inclusion in an LLM prompt.
   *
   * @returns {string} Formatted description
   */
  toPromptText() {
    let text = `- ${this.name}: ${this.description}`;

    // If we have type information, include it
    if (this.typeInfo) {
      if (this.typeInfo.signature) {
        text += `\n  Signature: ${this.typeInfo.signature}`;
      }
      if (this.typeInfo.params) {
        text += `\n  Parameters: ${JSON.stringify(this.typeInfo.params)}`;
      }
      if (this.typeInfo.returns) {
        text += `\n  Returns: ${this.typeInfo.returns}`;
      }
    }

    return text;
  }
}

/**
 * Create the built-in resultResolver capability.
 *
 * @param {Function} resolve - Function to call on success
 * @param {Function} reject - Function to call on failure
 * @returns {AgentCapability} The resultResolver capability
 */
export const createResultResolverCapability = (resolve, reject) => {
  return new AgentCapability({
    name: 'resultResolver',
    value: {
      resolve,
      reject,
    },
    description:
      'Object with resolve(value) and reject(error) methods to complete the query with a result or indicate failure',
    typeInfo: {
      signature: '{ resolve: (value: any) => void, reject: (error: any) => void }',
      params: {
        resolve: 'Function to call with the successful result value',
        reject: 'Function to call with an error to indicate failure',
      },
    },
  });
};
