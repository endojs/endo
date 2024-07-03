import React from 'react';
import { E } from '@endo/far';
import { makeReadonlyGrainMapFromRemote } from '@endo/grain/captp.js';
import { h, useAsync } from './util.js';
import { ActiveGameComponent, DeckManagerComponent, PlayGameComponent } from './game.js';
import { useFollowChanges, useLookup } from './endo.js';
const { useRef } = React;

const DeckSelector = ({ actions, deckName, setDeckByName, createNewDeck }) => {
  const inventory = useFollowChanges(() => actions.followNameChanges(), [])
  const names = inventory.map(({ name }) => name)
  const deckNames = names.filter(name => name.startsWith('deck-'))
  const newDeckOption = '<new empty deck>'
  const options = [
    newDeckOption,
    ...deckNames,
  ]
  const currentSelection = deckName || newDeckOption
  const isNewDeckSelected = currentSelection === newDeckOption
  const inputRef = useRef()

  return h('div', null, [
    h('h2', { key: 'title' }, 'Select Deck'),
    h('select', {
        key: 'selector',
        value: currentSelection,
        onChange: ({ target: { value }}) => setDeckByName(value),
      },
      options.map(name => h('option', { key: name, value: name }, name))
    ),
    isNewDeckSelected && h('div', null, [
      h('input', { key: 'input', type: 'text', ref: inputRef, defaultValue: 'deck-new' }),
      h('button', {
        key: 'button',
        onClick: () => createNewDeck(inputRef.current.value)
      }, 'Create New Deck'),
    ])
  ])
}

const GameMenu = ({ actions, setGameAgentName }) => {
  const inventory = useFollowChanges(() => actions.followNameChanges(), [])
  const names = inventory.map(({ name }) => name)
  const gameAgentNames = names.filter(name => name.startsWith('agent-game'))
  return h('div', null, [
    h('h2', { key: 'title' }, 'Select Game'),
    h('ul', { key: 'list' }, gameAgentNames.map(name => {
      return (
        h('li', { key: name }, [
          h('span', { key: 'label'}, name),
          h('button', {
            key: 'button',
            onClick: () => setGameAgentName(name),
          }, 'select'),
        ])
      )
    })),
  ])
}

export const App = ({ actions }) => {
  const [gameAgentName, setGameAgentName] = React.useState(undefined);
  const { value: gameKit } = useAsync(async () => {
    if (!gameAgentName) return
    const agent = await actions.lookup(gameAgentName)
    const game = await E(agent).lookup('game')
    return { agent, game }
    // todo, lookup game state / deck?
  }, [gameAgentName])
  const { agent, game } = gameKit || {};
  // // TODO: this is a disgusting rate of resubs
  // const stateGrain = game && makeReadonlyGrainMapFromRemote(E(game).getStateGrain())

  // slimeball workaround for useLookup subs failing for depth>1
  // manually increase to trigger refresh of deck value
  const [deckReadiness, setDeckReadiness] = React.useState(0)
  const { value: deck } = useLookup(actions, [gameAgentName, 'deck'], [deckReadiness]);

  const setDeckByName = async (newDeckName) => {
    console.log('set deck by name', newDeckName)
    const deckId = await actions.identify(newDeckName)
    console.log('set deck with id', deckId)
    await E(game).setDeck(deckId)
    setDeckReadiness(value => value + 1)
  }

  const deckMgmt = {
    // // deck mgmt
    // async fetchDeck () {
    //   // has-check is workaround for https://github.com/endojs/endo/issues/1843
    //   if (await actions.has('deck')) {
    //     const deck = await actions.lookup('deck')
    //     setDeck(deck)
    //   }
    // },
    // async makeNewDeck () {
    //   const deck = await actions.makeNewDeck()
    //   setDeck(deck)
    // },
    async addCardToDeckByName (cardName) {
      return actions.addCardToDeckByName(cardName)
    },
  }

  // TODO: select agent-game instead of hard code

  const gameMgmt = {
    // async fetchGame () {
    //   // has-check is workaround for https://github.com/endojs/endo/issues/1843
    //   if (await actions.has('game')) {
    //     const game = await actions.lookup('game')
    //     setDeck(game)
    //     const stateGrain = makeReadonlyGrainMapFromRemote(E(game).getStateGrain())
    //     setGame({ game, stateGrain })
    //   }
    // },
    // async start () {
    //   // make game
    //   const game = await actions.makeGame()
    //   const stateGrain = makeReadonlyGrainMapFromRemote(E(game).getStateGrain())
    //   setGame({ game, stateGrain })
    //   await E(game).start(deck)
    // },
    async playCardByIdFromHand (player, cardId, destinationPlayer) {
      await E(game).playCardByIdFromHand(player, cardId, destinationPlayer)
    },
  }

  // // on first render
  // React.useEffect(() => {
  //   deckMgmt.fetchDeck()
  //   gameMgmt.fetchGame()
  // }, []);

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
      // select game
      !gameAgentName && h(GameMenu, { key: 'game-list', actions, setGameAgentName }),
      // show selected game
      game && !deck && h(DeckSelector, { key: 'deck-selector', actions, setDeckByName, deck }),
      game && deck && h(DeckManagerComponent, { key: 'deck-manager', deck, deckMgmt, actions }),

      // // (legacy)
      // !game && h(DeckManagerComponent, { key: 'deck-manager', deck, deckMgmt, actions }),
      // game && deck && h(PlayGameComponent, { key: 'play-game-component', game, stateGrain, gameMgmt }),
      // game && h(ActiveGameComponent, { key: 'active-game-component', game, stateGrain, gameMgmt }),
    ])
  )
};