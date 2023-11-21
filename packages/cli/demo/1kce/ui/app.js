import React from 'react';
import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { makeReadonlyArrayGrainFromRemote } from '@endo/grain/captp.js';
import { h } from './util.js';
import { DeckManagerComponent, PlayGameComponent } from './game.js';

// no way of resolving relative paths from the weblet
const projectRootPath = './demo/1kce';

const makeThing = async (powers, importFullPath, resultName) => {
  const workerName = 'MAIN';
  const powersName = 'NONE';
  const deck = await E(powers).importUnsafeAndEndow(
    workerName,
    importFullPath,
    powersName,
    resultName,
  );
  return deck
}

const makeNewDeck = async (powers) => {
  const importFullPath = `${projectRootPath}/deck.js`;
  const resultName = 'deck';
  return await makeThing(powers, importFullPath, resultName)
}

const makeGame = async (powers) => {
  const importFullPath = `${projectRootPath}/game.js`;
  const resultName = 'game';
  return await makeThing(powers, importFullPath, resultName)
}

export const App = ({ powers }) => {
  const [deck, setDeck] = React.useState(undefined);
  const [game, setGame] = React.useState(undefined);

  const actions = {
    // deck mgmt
    async fetchDeck () {
      // workaround for https://github.com/endojs/endo/issues/1843
      if (await E(powers).has('deck')) {
        const deck = await E(powers).lookup('deck')
        setDeck(deck)
      }
    },
    async makeNewDeck () {
      const deck = await makeNewDeck(powers)
      setDeck(deck)
    },
    async addCardToDeck (card) {
      await E(deck).add(card);
    },
    async addCardToDeckByName (cardName) {
      const card = await E(powers).lookup(cardName)
      await E(deck).add(card);
    },
    async reverseLookupCard (card) {
      return await E(powers).reverseLookup(card)
    },
    async getCardDetails (card) {
      return await E(card).getDetails()
    },
    async getCardRenderer (card) {
      let renderer
      try {
        const code = await E(card).getRendererCode()
        const compartment = new Compartment({ Math, console })
        const makeRenderer = compartment.evaluate(`(${code})`)
        renderer = makeRenderer()
      } catch (err) {
        console.error(err)
        // ignore missing or failed renderer
        renderer = () => {}
      }
      return renderer
    },

    followCardsAtPlayerLocation (player, canceled) {
      return makeRefIterator(E(game).followCardsAtPlayerLocation(player, canceled))
    },
    getCardsAtPlayerLocationGrain (player) {
      const remoteGrain = E(game).getCardsAtPlayerLocationGrain(player)
      return makeReadonlyArrayGrainFromRemote(remoteGrain)
    },
    followPlayerHand (player, canceled) {
      return makeRefIterator(E(player).followHand(canceled))
    },
    getPlayerHandGrain (player) {
      const remoteGrain = E(player).getHandGrain()
      return makeReadonlyArrayGrainFromRemote(remoteGrain)
    },

    // inventory
    subscribeToNames () {
      return makeRefIterator(E(powers).followNames())
    },
    async removeName (name) {
      await E(powers).remove(name)
    },

    // game
    async start () {
      // make game
      const game = await makeGame(powers)
      setGame(game)
      await E(game).start(deck)
    },
    async playCardFromHand (player, card, destinationPlayer) {
      await E(game).playCardFromHand(player, card, destinationPlayer)
    },
  }

  // on first render
  React.useEffect(() => {
    actions.fetchDeck()
  }, []);

  return (
    h('div', {}, [
      h('h1', {
        key: 'title',
        style: {
          display: 'inline',
          border: '2px solid black',
          borderRadius: '12px',
          padding: '4px',
          background: 'white',
          fontSize: '42px',
        },
      }, ['🃏1kce🃏']),
      !game && h(DeckManagerComponent, { key: 'deck-manager', actions, deck }),
      deck && h(PlayGameComponent, { key: 'play-game-component', actions, game }),
    ])
  )
};