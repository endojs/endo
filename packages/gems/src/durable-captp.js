import { makeNetstringCapTP } from './daemon-vendor/connection.js';
import {
  installExternalReferenceController,
  makeCaptpOptionsForExtRefController,
} from './extref-controller.js';
import { makeSimplePresenceController } from './presence-controller.js';

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
  const presenceController = makeSimplePresenceController(getCaptp);
  const extRefController = installExternalReferenceController(
    name,
    zone,
    fakeVomKit,
    presenceController,
  );
  const extRefOpts = makeCaptpOptionsForExtRefController(extRefController);
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
