import { E } from '@endo/far';

export const start = powers => {
  const { petNameStorage, petMail, capabilityRequests, evaluationRequests } =
    powers;

  return harden({
    getName: () => E(petNameStorage).getName(),
    setName: name => E(petNameStorage).setName(name),
    sendMail: message => E(petMail).send(message),
    receiveMail: () => E(petMail).receive(),
    requestCapability: request => E(capabilityRequests).request(request),
    requestEvaluation: request => E(evaluationRequests).request(request),
  });
};
