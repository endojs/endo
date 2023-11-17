import { E, Far } from '@endo/far';
import { makeIteratorRef } from '@endo/daemon/reader-ref.js';
import { makeSyncArrayGrain, makeSyncGrain, makeSyncGrainArrayMap, makeSyncGrainMap, makeDerivedSyncGrain, composeGrainsAsync } from './grain.js';

const playerRemoteToLocal = new Map()
class Player {
  constructor (name) {
    const localPlayer = this
    this.name = name
    this.hand = makeSyncArrayGrain()
    this.remoteInterface = Far(`Player "${name}"`, {
      async getName () {
        return localPlayer.name
      },
      async followHand (canceled) {
        return makeIteratorRef(localPlayer.hand.follow(canceled))
      },
      async removeCard (card) {
        localPlayer.removeCard(card)
      }
    })
    playerRemoteToLocal.set(this.remoteInterface, localPlayer)
  }
  addCard (card) {
    this.hand.push(card)
  }
  removeCard (card) {
    this.hand.splice(this.hand.get().indexOf(card), 1)
  }
}

export function makeGame () {

  const state = makeSyncGrainMap({
    currentPlayer: makeSyncGrain(-1),
    deck: makeSyncArrayGrain(),
    log: makeSyncArrayGrain(),
    locations: makeSyncGrainArrayMap(),
  })
  const log = (message) => {
    state.getGrain('log').push(message)
  }

  // TODO: computed values are broken bc
  // they also depend on localPlayers which is not a grain
  const localPlayers = makeSyncArrayGrain()
  const currentLocalPlayerGrain = makeDerivedSyncGrain(
    state.getGrain('currentPlayer'),
    currentPlayerIndex => localPlayers.getAtIndex(currentPlayerIndex)
  )
  const currentRemotePlayerGrain = makeDerivedSyncGrain(
    currentLocalPlayerGrain,
    currentLocalPlayer => currentLocalPlayer?.remoteInterface
  )

  const defaultScoreFn = async ({ cards }) => {
    let score = 0
    for (const card of cards) {
      const { pointValue } = await E(card).getDetails()
      score += pointValue
    }
    return score
  }
  const scoreFn = makeSyncGrain(defaultScoreFn)

  const scoresGrain = composeGrainsAsync(
    { localPlayers, locations: state.getGrain('locations'), scoreFn },
    async ({ localPlayers, locations, scoreFn }) => {
      const scores = []
      for (const localPlayer of localPlayers) {
        const cards = locations[localPlayer.name]
        const score = await scoreFn({ cards })
        scores.push(score)
      }
      return scores
    },
    []
  )
  state.setGrain('scores', scoresGrain)

  const getState = () => {
    return state.get()
  }
  const followState = (canceled) => {
    return state.follow(canceled)
  }
  const followCurrentRemotePlayer = (canceled) => {
    return currentRemotePlayerGrain.follow(canceled)
  }
  const getCurrentPlayer = () => {
    const currentPlayerIndex = state.getGrain('currentPlayer').get()
    return localPlayers.getAtIndex(currentPlayerIndex)
  }
  const getPlayers = () => {
    return localPlayers.get().map(localPlayer => {
      return localPlayer.remoteInterface
    })
  }
  const addPlayer = (localPlayer) => {
    localPlayers.push(localPlayer)
  }
  const addCardToDeck = (card) => {
    state.getGrain('deck').push(card)
  }
  const importDeck = async (deck) => {
    // for await (const card of makeRefIterator(E(deck).getCards())) {
    for await (const card of await E(deck).getCards()) {
      addCardToDeck(card)
    }
  }
  const shuffleDeck = () => {
    const deck = state.getGrain('deck').get().slice()
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    state.getGrain('deck').set(deck)
  }

  const drawCard = () => {
    return state.getGrain('deck').pop()
  }
  const playerDrawsCards = (player, numCards) => {
    for (let i = 0; i < numCards; i++) {
      const card = drawCard()
      if (!card) {
        return
      }
      log(`${player.name} drew a card`)
      player.addCard(card)
    }
  }
  const drawInitialCards = () => {
    for (let i = 0; i < localPlayers.length; i++) {
      playerDrawsCards(localPlayers.getAtIndex(i), 3)
    }
  }

  const takeTurn = async () => {
    const currentPlayer = game.getCurrentPlayer()
    playerDrawsCards(currentPlayer, 1)
  }
  const advanceCurrentPlayer = () => {
    const currentPlayerGrain = state.getGrain('currentPlayer')
    currentPlayerGrain.set((currentPlayerGrain.get() + 1) % localPlayers.length)
    log(`Current player is now ${getCurrentPlayer().name}`)
  }
  const playCardFromHand = async (remoteSourcePlayer, card, remoteDestinationPlayer = remoteSourcePlayer) => {
    const localSourcePlayer = playerRemoteToLocal.get(remoteSourcePlayer)
    const localDestPlayer = playerRemoteToLocal.get(remoteDestinationPlayer)
    // remove card from hand
    localSourcePlayer.removeCard(card)
    // add card to player pile
    state.getGrain('locations').push(localDestPlayer.name, card)

    log(`${localSourcePlayer.name} played card to ${remoteSourcePlayer === remoteDestinationPlayer ? 'self' : localDestPlayer.name}`)
    // trigger card effect
    const controller = makeGameController(game)
    await E(card).play(controller)
    // next player
    advanceCurrentPlayer()
  }

  const getCardsAtLocation = (location) => {
    return state.getGrain('locations').getGrain(location)
  }

  // Far
  const game = {
    getState,
    followState,
    getPlayers,
    getCurrentPlayer,
    followCurrentRemotePlayer,
    advanceCurrentPlayer,
    addPlayer,
    addCardToDeck,
    takeTurn,
    drawCard,
    drawInitialCards,
    playCardFromHand,
    getCardsAtLocation,
    scoreFn,

    importDeck,
    shuffleDeck,
  }
  return game
}

// exposed to cards when played
export function makeGameController (game) {
  return Far('GameController', {
    async setScoreFn (scoreFnWrapper) {
      game.scoreFn.set(({ cards }) => {
        return E(scoreFnWrapper).scoreFn({ cards })
      })
    }
  })
}

export const make = (powers) => {
  const game = makeGame()
  game.addPlayer(new Player('alice'))
  game.addPlayer(new Player('bob'))
  return Far('Game', {
    async start (deck) {
      await game.importDeck(deck)
      game.shuffleDeck()
      game.drawInitialCards()
      game.advanceCurrentPlayer()
      await game.takeTurn()
    },
    async playCardFromHand (player, card, destinationPlayer) {
      await game.playCardFromHand(player, card, destinationPlayer)
    },
    async getPlayers () {
      return game.getPlayers()
    },
    async followState (canceled) {
      return makeIteratorRef(game.followState(canceled))
    },
    async followCurrentPlayer (canceled) {
      return makeIteratorRef(game.followCurrentRemotePlayer(canceled))
    },
    async getState () {
      return game.getState()
    },
    async getCardsAtLocation (location, canceled) {
      return makeIteratorRef(game.getCardsAtLocation(location).follow(canceled))
    },
    async getCardsAtPlayerLocation (player, canceled) {
      const { name } = playerRemoteToLocal.get(player)
      return makeIteratorRef(game.getCardsAtLocation(name).follow(canceled))
    },
  });
};