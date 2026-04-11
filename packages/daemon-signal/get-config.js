// @ts-check
import { E } from '@endo/eventual-send';
export const main = async host => {
  const bridge = await E(host).lookup('signal-bridge-tool');
  return E(bridge).execute({ action: 'getConfig' });
};
harden(main);
