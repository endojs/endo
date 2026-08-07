import harden from '@endo/harden';
import { Far } from '@endo/marshal';
import { E } from '@endo/eventual-send';

/**
 * @param {object} powers
 * @param {object} powers.llm
 * @param {object} powers.exec
 */
export const makeAgent = ({ llm, exec }) => {
  return Far('Agent', {
    async request(prompt) {
      const response = await E(llm).complete(prompt);
      return response;
    },
    async execute(command) {
      const result = await E(exec).run(command);
      return result;
    },
  });
};

harden(makeAgent);
