import { E, Far } from '@endo/far';

export const make = powers => {
  const patient = E(powers).request(
    'HOST',
    'a pet for analysis',
    'patient',
  );
  return Far('PetTherapist', {
    async _getInterface () {
      return [
        ['visit', []]
      ]
    },
    async _getDisplay () {
      const fulfillment = await E(patient)._getFulfillment();
      return JSON.stringify(fulfillment, undefined, 2);
    },
    async visit () {
      // do nothing, triggers display update
    }
  });
};
