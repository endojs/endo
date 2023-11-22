import React from 'react';
import { E } from '@endo/far';
import { makeReadonlyGrainMapFromRemote } from '@endo/grain/captp.js';
import { h } from './util.js';
import { DeckManagerComponent, PlayGameComponent } from './game.js';


export const App = ({ inventory }) => {
  const [deck, setDeck] = React.useState(undefined);
  const [{ game, stateGrain }, setGame] = React.useState({});

  const deckMgmt = {
    // deck mgmt
    async fetchDeck () {
      // has-check is workaround for https://github.com/endojs/endo/issues/1843
      if (await inventory.has('deck')) {
        const deck = await inventory.lookup('deck')
        setDeck(deck)
      }
    },
    async makeNewDeck () {
      const deck = await inventory.makeNewDeck()
      setDeck(deck)
    },
    async addCardToDeck (card) {
      await E(deck).add(card);
    },
    async addCardToDeckByName (cardName) {
      const card = await inventory.lookup(cardName)
      await E(deck).add(card);
    },
  }

  const gameMgmt = {
    async start () {
      // make game
      const game = await inventory.makeGame()
      const stateGrain = makeReadonlyGrainMapFromRemote(E(game).getStateGrain())
      setGame({ game, stateGrain })
      await E(game).start(deck)
    },
    async playCardFromHand (player, card, destinationPlayer) {
      await E(game).playCardFromHand(player, card, destinationPlayer)
    },
  }

  // on first render
  React.useEffect(() => {
    deckMgmt.fetchDeck()
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
      !game && h(DeckManagerComponent, { key: 'deck-manager', deck, deckMgmt, inventory }),
      deck && h(PlayGameComponent, { key: 'play-game-component', game, stateGrain, gameMgmt }),
    ])
  )
};