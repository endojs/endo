import React from 'react';
import { E } from '@endo/far';
import { makeReadonlyGrainMapFromRemote } from '@endo/grain/captp.js';
import { h } from './util.js';
import { ActiveGameComponent, DeckManagerComponent, PlayGameComponent } from './game.js';


export const App = ({ actions }) => {
  const [deck, setDeck] = React.useState(undefined);
  const [{ game, stateGrain }, setGame] = React.useState({});

  const deckMgmt = {
    // deck mgmt
    async fetchDeck () {
      // has-check is workaround for https://github.com/endojs/endo/issues/1843
      if (await actions.has('deck')) {
        const deck = await actions.lookup('deck')
        setDeck(deck)
      }
    },
    async makeNewDeck () {
      const deck = await actions.makeNewDeck()
      setDeck(deck)
    },
    async addCardToDeckByName (cardName) {
      return actions.addCardToDeckByName(cardName)
    },
  }

  const gameMgmt = {
    async fetchGame () {
      // has-check is workaround for https://github.com/endojs/endo/issues/1843
      if (await actions.has('game')) {
        const game = await actions.lookup('game')
        setDeck(game)
        const stateGrain = makeReadonlyGrainMapFromRemote(E(game).getStateGrain())
        setGame({ game, stateGrain })
      }
    },
    async start () {
      // make game
      const game = await actions.makeGame()
      const stateGrain = makeReadonlyGrainMapFromRemote(E(game).getStateGrain())
      setGame({ game, stateGrain })
      await E(game).start(deck)
    },
    async playCardByIdFromHand (player, cardId, destinationPlayer) {
      await E(game).playCardByIdFromHand(player, cardId, destinationPlayer)
    },
  }

  // on first render
  React.useEffect(() => {
    deckMgmt.fetchDeck()
    gameMgmt.fetchGame()
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
      !game && h(DeckManagerComponent, { key: 'deck-manager', deck, deckMgmt, actions }),
      !game && deck && h(PlayGameComponent, { key: 'play-game-component', game, stateGrain, gameMgmt }),
      game && h(ActiveGameComponent, { key: 'active-game-component', game, stateGrain, gameMgmt }),
    ])
  )
};