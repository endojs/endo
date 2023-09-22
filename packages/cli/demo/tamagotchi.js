import { Far } from '@endo/far';

export const make = () => {
  const state = {
    happiness: 0,
    fulfillment: {
      physiological: 40,
      safety: 60,
      loveAndBelonging: 40,
      esteem: 20,
      selfActualization: 80,
    },
  };
  const updateHappiness = () => {
    // need stack
    // - physiological
    // - safety
    // - loveAndBelonging
    // - esteem
    // - selfActualization

    // each need fulfillment component limits the value of the ones above it
    const physiologicalComponent = state.fulfillment.physiological;
    const safetyComponent = Math.min(
      physiologicalComponent,
      state.fulfillment.safety,
    )
    const loveAndBelongingComponent = Math.min(
      safetyComponent,
      state.fulfillment.loveAndBelonging,
    )
    const esteemComponent = Math.min(
      loveAndBelongingComponent,
      state.fulfillment.esteem,
    )
    const selfActualizationComponent = Math.min(
      esteemComponent,
      state.fulfillment.selfActualization,
    )

    state.happiness = (
      selfActualizationComponent +
      esteemComponent +
      loveAndBelongingComponent +
      safetyComponent +
      physiologicalComponent
    ) / 5;
  };

  const increaseFulfillment = (need, amount) => {
    state.fulfillment[need] = Math.min(100, amount + state.fulfillment[need]);
  }
  updateHappiness();
  return Far('Tamagotchi', {
    _getInterface () {
      return [
        ['feed', []],
        ['reassure', []],
        ['pet', []],
        ['compliment', []],
        ['instructToDoResearch', []],
        ['_getFulfillment', []],
      ]
    },
    _getDisplay () {
      const catFaces = [
        '🦁',
        '😻',
        '😽',
        // '😹',
        '😸',
        '😺',
        '🐱',
        '😼',
        '😾',
        '😿',
        '🙀',
        '💀',
      ].reverse();
      const currentFace = catFaces[Math.floor(state.happiness / 100 * (catFaces.length - 1))];
      return `${currentFace}`
    },
    _getFulfillment () {
      return { ...state.fulfillment };
    },
    feed () {
      increaseFulfillment('physiological', 20);
      updateHappiness();
    },
    reassure () {
      increaseFulfillment('safety', 20);
      updateHappiness();
    },
    pet () {
      increaseFulfillment('loveAndBelonging', 20);
      updateHappiness();
    },
    compliment () {
      increaseFulfillment('esteem', 20);
      updateHappiness();
    },
    instructToDoResearch () {
      increaseFulfillment('selfActualization', 20);
      updateHappiness();
    },
  });
};
