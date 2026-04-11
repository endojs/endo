// @ts-check
import { E } from '@endo/eventual-send';
/** @param {any} host */
export const main = async host => {
  const bridge = await E(host).lookup('signal-bridge-tool');
  const result = await E(bridge).execute({ action: 'pollOnce', timeoutSeconds: 10 });
  return result;
};
harden(main);
