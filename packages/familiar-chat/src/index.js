import { makeCapability } from '@endo/captp/init.js';
import { makePromiseKit } from '@endo/promise-kit';

/**
 * Create a chat caplet with the given persona and configuration.
 *
 * @param {object} persona - The chat persona configuration
 * @param {object} config - Additional chat configuration options
 * @returns {object} The chat caplet
 */
export const makeChatCaplet = (persona, config = {}) => {
  const { name = 'chat', description = 'A chat interface' } = persona;
  
  const chatKit = makePromiseKit();
  const [chatP, chatR] = chatKit;
  
  const chatCaplet = makeCapability(
    'chat',
    {
      name,
      description,
      async chat(message) {
        // Basic echo implementation - to be enhanced with actual chat logic
        const response = `Echo: ${message}`;
        chatR.resolve(response);
        return chatP;
      },
    },
    {}
  );
  
  return chatCaplet;
};

export default makeChatCaplet;