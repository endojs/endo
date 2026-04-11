// @ts-check
import { E } from '@endo/eventual-send';
/** @param {any} host */
export const main = async host => {
  const bridge = await E(host).lookup('signal-bridge-tool');
  const result = await E(bridge).execute({
    action: 'handle',
    message: {
      source: '00000000-0000-0000-0000-000000000000',
      sourceUuid: '00000000-0000-0000-0000-000000000000',
      text: '/help',
    },
  });
  return result;
};
harden(main);
