import React from 'react';
import { E } from '@endo/far';
import { makeReadonlyGrainMapFromRemote } from '@endo/grain/captp.js';
import { h, useAsync } from './util.js';
import { ActiveGameComponent, DeckManagerComponent, PlayGameComponent } from './game.js';
import { useFollowChanges, useLookup } from './endo.js';
// endo bundler workaround
const { useRef, useState, Fragment } = React;

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

const PlayersManagerComponent = ({ playerMgmt }) => {
  const ref = useRef()
  return h('div', {}, [
    // input for form name to save
    h('input', { ref, defaultValue: 'player-2' }),
    h('button', {
      onClick: () => playerMgmt.newPlayer(ref.current.value)
    }, 'create invite'),
  ])
}

const GameStartComponent = ({ gameMgmt}) => {
  return h('button', {
    onClick: () => gameMgmt.start()
  }, 'Start Game')
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

  const [currentPlayer, setCurrentPlayer] = useState();
  const [stateGrain, setStateGrain] = useState();

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
  const playerMgmt = {
    async newPlayer(destName) {
      console.log('new player', destName)
      // create the player in the game
      const newPlayerIndex = await E(game).newPlayer()
      // create the facet in the players inventory
      // TODO: evaluate endowments doesnt actually supports paths?
      // await actions.evaluate(`E(game).playerAtIndex(${Number(newPlayerIndex)})`, {
      //   game: `${gameAgentName}.game`
      // }, destName)
      await actions.evaluate(`E(game).playerAtIndex(${Number(newPlayerIndex)})`, {
        game: `${gameAgentName}.game`
      }, destName)
    }
  }

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
    async start () {
      await E(game).start()
      const player = await E(game).playerAtIndex(0)
      const remoteGrainP = E(player).getStateGrain()
      const stateGrain = makeReadonlyGrainMapFromRemote(remoteGrainP)

      setCurrentPlayer(player)
      setStateGrain(stateGrain)
    },
    async playCardByIdFromHand (player, cardId, destinationPlayer) {
      await E(game).playCardByIdFromHand(player, cardId, destinationPlayer)
    },
  }

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

      !stateGrain && h(Fragment, null, [
        // select game
        !gameAgentName && h(GameMenu, { key: 'game-list', actions, setGameAgentName }),
        // show selected game
        game && !deck && h(DeckSelector, { key: 'deck-selector', actions, setDeckByName, deck }),
        game && deck && h(DeckManagerComponent, { key: 'deck-manager', deck, deckMgmt, actions }),

        // players Component
        game && h(PlayersManagerComponent, { key: 'players-manager', playerMgmt, }),
        game && deck && h(GameStartComponent, { key: 'game-start', gameMgmt }),
      ]),
      h(Fragment, null, [
        
        // // (legacy)
        // !game && h(DeckManagerComponent, { key: 'deck-manager', deck, deckMgmt, actions }),
        // game && deck && h(PlayGameComponent, { key: 'play-game-component', game, stateGrain, gameMgmt }),
        stateGrain && h(ActiveGameComponent, { key: 'active-game-component', game, stateGrain, gameMgmt }),
      ]),

    ])
  )
};