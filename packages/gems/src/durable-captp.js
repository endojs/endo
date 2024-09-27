import { makeNetstringCapTP } from './daemon-vendor/connection.js';
import { installExtRefController } from './extref-controller.js';

export const makeDurableCaptp = (
  name,
  zone,
  fakeVomKit,
  connection,
  cancelled,
  bootstrap,
  opts = {},
) => {
  let captp;
  const getCaptp = () => captp;
  const { captpOpts: extRefOpts } = installExtRefController(
    name,
    zone,
    fakeVomKit,
    getCaptp,
  );
  const captpOpts = { ...opts, ...extRefOpts };
  const netStringCaptpClient = makeNetstringCapTP(
    name,
    connection.writer,
    connection.reader,
    cancelled,
    bootstrap,
    captpOpts,
  );
  captp = netStringCaptpClient.captp;
  return netStringCaptpClient;
};
