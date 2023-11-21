import { E, Far } from '@endo/far';
import { makeIteratorRef } from '@endo/daemon/reader-ref.js';
import { makeSyncArrayGrain, makeSyncGrain, makeSyncGrainArrayMap, makeSyncGrainMap, makeDerivedSyncGrain, composeGrainsAsync, composeGrains } from '@endo/grain';
import { makeRemoteGrain } from '@endo/grain/captp.js';

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
      async getHandGrain () {
        return makeRemoteGrain(localPlayer.hand)
      },
      async removeCard (card) {
        localPlayer.removeCard(card)
      },
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

  // logging
  const logGrain = makeSyncArrayGrain()
  const log = (message) => {
    logGrain.push(message)
  }

  // players
  const localPlayers = makeSyncArrayGrain()
  const remotePlayers = makeDerivedSyncGrain(
    localPlayers,
    localPlayers => localPlayers.map(localPlayer => localPlayer.remoteInterface),
  )
  const followRemotePlayers = (canceled) => {
    return remotePlayers.follow(canceled)
  }
  const getRemotePlayersGrain = () => {
    return remotePlayers
  }
  const addPlayer = (localPlayer) => {
    localPlayers.push(localPlayer)
  }

  // current player
  const currentPlayerIndex = makeSyncGrain(0)
  const currentLocalPlayer = composeGrains(
    { localPlayers, currentPlayerIndex },
    ({ localPlayers, currentPlayerIndex }) => localPlayers[currentPlayerIndex],
  )
  const currentRemotePlayer = makeDerivedSyncGrain(
    currentLocalPlayer,
    currentLocalPlayer => currentLocalPlayer?.remoteInterface,
  )
  const followCurrentRemotePlayer = (canceled) => {
    return currentRemotePlayer.follow(canceled)
  }
  const getCurrentRemotePlayerGrain = () => {
    return currentRemotePlayer
  }
  const advanceCurrentPlayer = () => {
    const currentPlayerGrain = currentPlayerIndex
    currentPlayerGrain.update(currentPlayer => (currentPlayer + 1) % localPlayers.getLength())
    log(`Current player is now ${currentLocalPlayer.get().name}`)
  }

  // turn phases
  const turnPhases = makeSyncArrayGrain([
    'draw',
    'play',
    'end',
  ])
  const currentTurnPhase = makeSyncGrain(0)
  const currentTurnPhaseName = makeDerivedSyncGrain(
    currentTurnPhase,
    currentTurnPhase => turnPhases.getAtIndex(currentTurnPhase),
  )
  const advanceTurnPhase = () => {
    currentTurnPhase.update(currentTurnPhase => (currentTurnPhase + 1) % turnPhases.getLength())
  }
  const resetTurnPhase = () => {
    currentTurnPhase.set(0)
  }
  const prependTurnPhase = (phase) => {
    turnPhases.unshift(phase)
    // advance turn phase so that we are still on the current phase
    advanceTurnPhase()
  }
  const appendTurnPhase = (phase) => {
    turnPhases.push(phase)
  }

  // locations
  const locations = makeSyncGrainArrayMap()
  const getCardsAtLocation = (location) => {
    return locations.getGrain(location)
  }

  // scoring
  const defaultScoreFn = async ({ cards }) => {
    let score = 0
    for (const card of cards) {
      const { pointValue } = await E(card).getDetails()
      score += pointValue
    }
    return score
  }
  const scoreFn = makeSyncGrain(defaultScoreFn)
  const setScoreFn = (newScoreFn) => scoreFn.set(newScoreFn)
  const scoresGrain = composeGrainsAsync(
    { localPlayers, locations, scoreFn },
    async ({ localPlayers, locations, scoreFn }) => {
      const scores = []
      for (const localPlayer of localPlayers) {
        const cards = locations[localPlayer.name] || []
        const score = await scoreFn({ cards })
        scores.push(score)
      }
      return scores
    },
    [],
  )

  // deck
  const deckGrain = makeSyncArrayGrain()
  const addCardToDeck = (card) => {
    deckGrain.push(card)
  }
  const importDeck = async (deck) => {
    for await (const card of await E(deck).getCards()) {
      addCardToDeck(card)
    }
  }
  const shuffleDeck = () => {
    const deck = deckGrain.get().slice()
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    deckGrain.set(deck)
  }

  // cards
  const drawCard = () => {
    return deckGrain.pop()
  }
  const playerDrawsCards = (localPlayer, numCards) => {
    for (let i = 0; i < numCards; i++) {
      const card = drawCard()
      if (!card) {
        return
      }
      log(`${localPlayer.name} drew a card`)
      localPlayer.addCard(card)
    }
  }
  const drawInitialCards = () => {
    for (const localPlayer of localPlayers.get()) {
      playerDrawsCards(localPlayer, 3)
    }
  }

  // play
  const continueTurn = async () => {
    while (true) {
      const currentPlayer = currentLocalPlayer.get()
      const phaseName = currentTurnPhaseName.get()
      switch (phaseName) {
        case 'draw':
          playerDrawsCards(currentPlayer, 1)
          advanceTurnPhase()
          break
        case 'play':
          // do nothing, player will play a card
          // which will advance the turn phase
          // and continue turn
          return
        case 'end':
          advanceCurrentPlayer()
          resetTurnPhase()
          break
        default:
          currentTurnPhase.get()
          throw new Error(`Unexpected turn phase "${phaseName}"`)
      }
    }
  }
  // game controller is exposed to cards when played
  const makeGameController = () => {
    return Far('GameController', {
      // i think you need to wrap the scoreFn in a Far, so i did
      async setScoreFn (scoreFnWrapper) {
        setScoreFn(({ cards }) => {
          return E(scoreFnWrapper).scoreFn({ cards })
        })
      },
      async prependTurnPhase (phase) {
        prependTurnPhase(phase)
      },
      async appendTurnPhase (phase) {
        appendTurnPhase(phase)
      },
      async getDeckCards () {
        return deckGrain.get()
      },
      async addCardsToDeck (cards) {
        for (const card of cards) {
          addCardToDeck(card)
        }
      },
    })
  }
  const playCard = async (card) => {
    const controller = makeGameController()
    await E(card).play(controller)
  }
  const playCardFromHand = async (localSourcePlayer, card, localDestinationPlayer = localSourcePlayer) => {
    // move card from hand to destination
    localSourcePlayer.removeCard(card)
    locations.push(localDestinationPlayer.name, card)
    const isPlayedToSelf = localSourcePlayer === localDestinationPlayer
    log(`${localSourcePlayer.name} played card to ${isPlayedToSelf ? 'self' : localDestinationPlayer.name}`)
    // trigger card effect
    await playCard(card)
    advanceTurnPhase()
    // dont await completion
    continueTurn()
  }
  const start = async (deck) => {
    await importDeck(deck)
    shuffleDeck()
    drawInitialCards()
    // dont await completion
    continueTurn()
  }

  // game state, aggregated for remote subscribers
  const state = makeSyncGrainMap({
    log: logGrain,
    currentPlayer: currentPlayerIndex,
    currentTurnPhase: currentTurnPhaseName,
    locations,
    scores: scoresGrain,
    deck: deckGrain,
  })
  const followState = (canceled) => {
    return state.follow(canceled)
  }

  // Far
  const game = {
    state,
    addPlayer,
    start,
    playCardFromHand,
    followRemotePlayers,
    getRemotePlayersGrain,
    followState,
    followCurrentRemotePlayer,
    getCurrentRemotePlayerGrain,
    getCardsAtLocation,
  }
  return game
}

export const make = (powers) => {
  const game = makeGame()
  game.addPlayer(new Player('alice'))
  game.addPlayer(new Player('bob'))
  return Far('Game', {
    async start (deck) {
      await game.start(deck)
    },
    async playCardFromHand (remoteSourcePlayer, card, remoteDestinationPlayer) {
      const localSourcePlayer = playerRemoteToLocal.get(remoteSourcePlayer)
      const localDestinationPlayer = playerRemoteToLocal.get(remoteDestinationPlayer)
      await game.playCardFromHand(localSourcePlayer, card, localDestinationPlayer)
    },

    async followPlayers (canceled) {
      return makeIteratorRef(game.followRemotePlayers(canceled))
    },
    async getPlayersGrain () {
      return makeRemoteGrain(game.getRemotePlayersGrain())
    },

    async followState (canceled) {
      return makeIteratorRef(game.followState(canceled))
    },
    async getStateGrain () {
      return makeRemoteGrain(game.state)
    },

    async followCurrentPlayer (canceled) {
      return makeIteratorRef(game.followCurrentRemotePlayer(canceled))
    },
    async getCurrentPlayerGrain () {
      return makeRemoteGrain(game.getCurrentRemotePlayerGrain())
    },

    async followCardsAtLocation (location, canceled) {
      return makeIteratorRef(game.getCardsAtLocation(location).follow(canceled))
    },

    async followCardsAtPlayerLocation (remotePlayer, canceled) {
      const { name } = playerRemoteToLocal.get(remotePlayer)
      return makeIteratorRef(game.getCardsAtLocation(name).follow(canceled))
    },
    async getCardsAtPlayerLocationGrain (remotePlayer) {
      const { name } = playerRemoteToLocal.get(remotePlayer)
      return makeRemoteGrain(game.getCardsAtLocation(name))
    },
  });
};