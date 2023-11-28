import { E, Far } from '@endo/far';
import { makeRemoteGrain, makeRemoteGrainMap } from '@endo/grain/captp.js';
import { makeReaderRef } from '@endo/daemon/reader-ref.js';
import { makeRefReader } from '@endo/daemon/ref-reader.js';
import {
  makeSyncArrayGrain,
  makeSyncGrain,
  makeSyncGrainArrayMap,
  makeSyncGrainMap,
  makeDerivedSyncGrain,
  composeGrainsAsync,
  composeGrains,
} from '@endo/grain';
import { makeMutex } from './util.js';

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const playerRemoteToLocal = new Map()
const makePlayer = (getCardDataById, initialState = {}) => {
  const name = initialState.name || 'player'
  const handIds = makeSyncArrayGrain(initialState.handIds || [])
  const hand = makeDerivedSyncGrain(
    handIds,
    handIds => handIds.map(id => getCardDataById(id)),
  )
  const addCardById = (cardId) => {
    handIds.push(cardId)
  }
  const removeCardById = (cardId) => {
    const index = handIds.get().indexOf(cardId)
    if (index === -1) return
    handIds.splice(index, 1)
  }

  const remoteInterface = Far(`Player "${name}"`, {
    async getName () {
      return name
    },
    async getHandGrain () {
      return makeRemoteGrain(hand)
    },
    async removeCardById (cardId) {
      removeCardById(cardId)
    },
  })
  const localPlayer = {
    name,
    handIds,
    hand,
    addCardById,
    removeCardById,
    remoteInterface,
  }
  playerRemoteToLocal.set(remoteInterface, localPlayer)
  return localPlayer
}

export function makeGame (initialState = {}, deck, persistState) {

  // logging
  const logGrain = makeSyncArrayGrain(initialState.log || [])
  const log = (message) => {
    logGrain.push(message)
  }

  // players
  const localPlayers = makeSyncArrayGrain()
  const playerHandIds = makeSyncGrainMap()
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
    playerHandIds.setGrain(localPlayer.name, localPlayer.handIds)
  }

  // current player
  const currentPlayerIndex = makeSyncGrain(initialState.currentPlayerIndex || 0)
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
  const turnPhases = makeSyncArrayGrain(initialState.turnPhases || [
    'draw',
    'play',
    'end',
  ])
  const currentTurnPhase = makeSyncGrain(initialState.currentTurnPhase || 0)
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
  const initialLocations = Object.fromEntries(Object.entries(initialState.locations || {}).map(([location, cardIds]) => {
    return [location, makeSyncArrayGrain(cardIds)]
  }))
  // const initialLocations = undefined
  const locations = makeSyncGrainArrayMap(initialLocations)
  const getLocationGrain = (location) => {
    return locations.getGrain(location)
  }
  const getCardsDataAtLocation = (location) => {
    // if we dont guard here we trigger inf-loop protections on
    // locations grainMap bc a read triggers a write
    // problematic when using this function to derive a grain
    if (!locations.hasGrain(location)) {
      return []
    }
    const cardIds = getLocationGrain(location).get()
    return cardIds.map(id => getCardDataById(id))
  }
  // TODO: consider automatically checking if in a location and removing
  const setLocationForCardId = (cardId, to, from) => {
    if (from) {
      locations.remove(from, cardId)
    }
    locations.push(to, cardId)
  }

  // scoring
  const scoreFnCard = makeSyncGrain(initialState.scoreFnCard || undefined)
  const defaultScoreFn = async ({ cardsData }) => {
    let score = 0
    for (const cardData of cardsData) {
      const { pointValue } = await E(cardData.remote).getDetails()
      score += pointValue
    }
    return score
  }
  const scoreFn = makeDerivedSyncGrain(
    scoreFnCard,
    scoreFnCard => {
      if (scoreFnCard) {
        return async ({ cardsData }) => {
          const { cardId, methodName } = scoreFnCard
          const cardData = getCardDataById(cardId)
          if (!cardData) return 0
          return E(cardData.remote)[methodName]({ cardsData })
        }
      }
      return defaultScoreFn
    },
  )
  const scoresGrain = composeGrainsAsync(
    { localPlayers, locations, scoreFn },
    async ({ localPlayers, scoreFn }) => {
      const scores = []
      for (const localPlayer of localPlayers) {
        const cardsData = getCardsDataAtLocation(localPlayer.name)
        const score = await scoreFn({ cardsData })
        scores.push(score)
      }
      return scores
    },
    [],
  )

  // deck - the deck is the local copy of the deck cards we will play with
  // a card's id is its index in the deck
  const deckGrain = makeSyncArrayGrain()
  const getCardRemoteById = (id) => {
    return deckGrain.getAtIndex(id)
  }
  const getCardDataById = (id) => {
    const remote = getCardRemoteById(id)
    if (!remote) {
      return undefined
    }
    return {
      id,
      remote,
    }
  }
  const importDeck = async () => {
    for await (const card of await E(deck).getCards()) {
      deckGrain.push(card)
    }
  }

  // draw stack - this is the stack of cards the players draw from
  const drawStackIds = makeSyncArrayGrain(initialState.drawStackIds || [])
  const drawStackCount = makeDerivedSyncGrain(
    drawStackIds,
    drawStackIds => drawStackIds.length,
  )
  // draw stack cards are { id, remote }
  const drawStack = makeDerivedSyncGrain(
    drawStackIds,
    drawStackIds => drawStackIds.map(id => getCardDataById(id)),
  )
  const addCardByIdToDrawStack = (cardId) => {
    drawStackIds.push(cardId)
  }
  const populateDrawStackFromDeck = () => {
    deckGrain.get().forEach((_card, index) => {
      const id = index
      addCardByIdToDrawStack(id)
    })
  }
  const shuffleDrawStack = () => {
    const cards = drawStackIds.get().slice()
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    drawStackIds.set(cards)
  }

  // cards
  const drawCard = () => {
    const id = drawStackIds.pop()
    if (id === undefined) {
      return undefined
    }
    return getCardDataById(id)
  }
  const playerDrawsCards = (localPlayer, numCards) => {
    for (let i = 0; i < numCards; i++) {
      const cardData = drawCard()
      if (!cardData) {
        log(`${localPlayer.name} tried to draw a card, but none remain`)
        return
      }
      log(`${localPlayer.name} drew a card`)
      localPlayer.addCardById(cardData.id)
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
  const makeGameController = (cardData) => {
    return Far('GameController', {
      // i think you need to wrap the scoreFn in a Far, so i did
      async setScoreFn (methodName) {
        // set scoreFn card
        const { name: cardName } = await E(cardData.remote).getDetails()
        log(`${cardName} overwrote the scoring function`)
        scoreFnCard.set({ cardId: cardData.id, methodName })
      },
      async prependTurnPhase (phase) {
        prependTurnPhase(phase)
      },
      async appendTurnPhase (phase) {
        appendTurnPhase(phase)
      },
      async getDrawStackCards () {
        return drawStack.get()
      },
      async addCardsByIdToDrawStack (cardIds) {
        for (const cardId of cardIds) {
          addCardByIdToDrawStack(cardId)
        }
      },
    })
  }
  const playCard = async (cardData) => {
    const controller = makeGameController(cardData)
    await E(cardData.remote).play(controller)
  }
  const playCardByIdFromHand = async (localSourcePlayer, cardId, localDestinationPlayer = localSourcePlayer) => {
    const cardData = getCardDataById(cardId)
    // move card from hand to destination
    localSourcePlayer.removeCardById(cardData.id)
    setLocationForCardId(cardData.id, localDestinationPlayer.name)
    // note in log
    const isPlayedToSelf = localSourcePlayer === localDestinationPlayer
    log(`${localSourcePlayer.name} played card to ${isPlayedToSelf ? 'self' : localDestinationPlayer.name}`)
    // trigger card effect
    await playCard(cardData)
    // continue turn, dont await completion
    advanceTurnPhase()
    continueTurn()
  }
  // to be called at boot of game
  const initialize = async () => {
    // get a local copy of the deck cards
    await importDeck(deck)
    // create players
    const aliceData = {
      name: 'alice',
      handIds: initialState.playerHandIds?.alice || [],
    }
    const bobData = {
      name: 'bob',
      handIds: initialState.playerHandIds?.bob || [],
    }
    addPlayer(makePlayer(getCardDataById, aliceData))
    addPlayer(makePlayer(getCardDataById, bobData))
  }
  // to be called at the start of a new game
  const start = async () => {
    // populate the draw stack
    populateDrawStackFromDeck()
    shuffleDrawStack()
    // draw initial cards
    drawInitialCards()
    // start turn, dont await completion
    continueTurn()
  }

  // remote observable game state, aggregated for remote subscribers
  const statePublic = makeSyncGrainMap({
    log: logGrain,
    currentPlayer: currentRemotePlayer,
    currentTurnPhase: currentTurnPhaseName,
    locations,
    scores: scoresGrain,
    drawStackCount,
    players: remotePlayers,
  })

  // persisted game state
  const statePersist = makeSyncGrainMap({
    log: logGrain,
    drawStackIds,
    playerHandIds,
    locations,
    currentPlayerIndex,
    currentTurnPhase,
    turnPhases,
    scoreFnCard,
  })
  statePersist.subscribe(newState => {
    persistState(newState).catch(err => {
      log(`Error persisting state: ${err.message}`)
    })
  })

  // Far
  const game = {
    state: statePublic,
    initialize,
    start,
    getCardDataById,
    playCardByIdFromHand,
    followRemotePlayers,
    getRemotePlayersGrain,
    followCurrentRemotePlayer,
    getCurrentRemotePlayerGrain,
    getLocationGrain,
  }
  return game
}

export const make = async (powers) => {

  const loadState = async () => {
    if (!await E(powers).has('state')) {
      return undefined
    }
    const readable = await E(powers).lookup('state');
    const readerRef = E(readable).stream();
    const reader = makeRefReader(readerRef);
    let stateBlob = ''
    for await (const chunk of reader) {
      stateBlob += textDecoder.decode(chunk)
    }
    return JSON.parse(stateBlob)
  }
  const mutex = makeMutex()
  const persistState = async (state) => {
    await mutex.enqueue(async () => {
      const stateBlob = JSON.stringify(state)
      const encoded = textEncoder.encode(stateBlob)
      const reader = makeReaderRef([encoded])
      await E(powers).store(reader, 'state')
    })
  }

  const deck = await E(powers).request(
    // recipient
    'HOST',
    // description
    'game/deck',
    // my petname
    'deck',
  )

  const gameState = await loadState()
  const game = makeGame(gameState, deck, persistState)
  await game.initialize()

  return Far('Game', {
    async start () {
      return game.start()
    },
    async playCardByIdFromHand (remoteSourcePlayer, cardId, remoteDestinationPlayer) {
      const localSourcePlayer = playerRemoteToLocal.get(remoteSourcePlayer)
      const localDestinationPlayer = playerRemoteToLocal.get(remoteDestinationPlayer)
      await game.playCardByIdFromHand(localSourcePlayer, cardId, localDestinationPlayer)
    },
    async getPlayersGrain () {
      return makeRemoteGrain(game.getRemotePlayersGrain())
    },
    async getStateGrain () {
      return makeRemoteGrainMap(game.state)
    },
    async getCurrentPlayerGrain () {
      return makeRemoteGrain(game.getCurrentRemotePlayerGrain())
    },
    async getCardsAtPlayerLocationGrain (remotePlayer) {
      const { name } = playerRemoteToLocal.get(remotePlayer)
      const locationCardIdsGrain = game.getLocationGrain(name)
      // map location cardIds to CardData
      // TODO: mem leak because we never unsubscribe / subscriptions are not lazy
      const locationCardDataGrain = makeDerivedSyncGrain(
        locationCardIdsGrain,
        locationCardIds => locationCardIds.map(id => game.getCardDataById(id)),
      )
      return makeRemoteGrain(locationCardDataGrain)
    },
  });
};