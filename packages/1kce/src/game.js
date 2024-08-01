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

// Math.random not availabile in Compartment,
// temporary workaround. Used for shuffling.
// Shhh, don't tell anyone.
// from https://gist.github.com/mathiasbynens/5670917
const getPseudoRandom = (() => {
  let seed = 0x2F6E2B1;
  return function() {
    // Robert Jenkins’ 32 bit integer hash function
    seed = ((seed + 0x7ED55D16) + (seed << 12))  & 0xFFFFFFFF;
    seed = ((seed ^ 0xC761C23C) ^ (seed >>> 19)) & 0xFFFFFFFF;
    seed = ((seed + 0x165667B1) + (seed << 5))   & 0xFFFFFFFF;
    seed = ((seed + 0xD3A2646C) ^ (seed << 9))   & 0xFFFFFFFF;
    seed = ((seed + 0xFD7046C5) + (seed << 3))   & 0xFFFFFFFF;
    seed = ((seed ^ 0xB55A4F09) ^ (seed >>> 16)) & 0xFFFFFFFF;
    return (seed & 0xFFFFFFF) / 0x10000000;
  };
})();

const playerRemoteToLocal = new Map()
const makePlayer = (getCardDataById, playerInitialState = {}) => {
  const name = playerInitialState.name || '[unknown player]'
  const handIds = makeSyncArrayGrain(playerInitialState.handIds || [])
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

  // this is a remote interface for a player
  // and should not allow access to priveledged into like the hand
  // (but it does for now) 
  // we rely on captp identity continuity for this elsewhere
  const remoteInterface = Far(`Player "${name}"`, {
    // public
    async getName () {
      return name
    },
    // (supposed to be) private
    async getHandGrain () {
      return makeRemoteGrain(hand)
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

const getDefaultState = () => ({
  log: [],
  playerHandIds: {},
  locations: {},
  currentPlayerIndex: 0,
  turnPhases: ['draw','play','end'],
  currentTurnPhase: 0,
  scoreFnCard: undefined, 
  drawStackIds: [],
})

export function makeGame (initialState = getDefaultState(), deck, persistState) {

  // logging
  const logGrain = makeSyncArrayGrain(initialState.log)
  const log = (message) => {
    logGrain.push(message)
  }

  // players
  const localPlayers = makeSyncArrayGrain()
  const playerHandIds = makeSyncGrainMap(initialState.playerHandIds)
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
  const getPlayerCount = () => {
    return localPlayers.getLength()
  }
  const getLocalPlayerAtIndex = (index) => {
    return localPlayers.getAtIndex(index)
  }

  // current player
  const currentPlayerIndex = makeSyncGrain(initialState.currentPlayerIndex)
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
  const turnPhases = makeSyncArrayGrain(initialState.turnPhases)
  const currentTurnPhase = makeSyncGrain(initialState.currentTurnPhase)
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
  const initialLocations = Object.fromEntries(Object.entries(initialState.locations).map(([location, cardIds]) => {
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
  const scoreFnCard = makeSyncGrain(initialState.scoreFnCard)
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
    console.log(`imported ${deckGrain.getLength()} cards`)
  }

  // draw stack - this is the stack of cards the players draw from
  const drawStackIds = makeSyncArrayGrain(initialState.drawStackIds)
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
      const j = Math.floor(getPseudoRandom() * (i + 1));
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
  }
  // to be called at the start of a new game
  const start = async () => {
    // initialize
    await initialize()
    // populate the draw stack
    populateDrawStackFromDeck()
    shuffleDrawStack()
    // draw initial cards
    drawInitialCards()
    // start turn, dont await completion
    continueTurn()
  }

  // load local players from initial state
  // TODO: weird this happens here, but we need `getCardDataById`
  // "localPlayers" likely needs a simpler design
  // and maybe a more explicit entry in the state
  Object.entries(initialState.playerHandIds).map(([name, handIds]) => {
    localPlayers.push(makePlayer(getCardDataById, { name, handIds }))
  })

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

  const game = {
    state: statePublic,
    initialize,
    addPlayer,
    makePlayer,
    getLocalPlayerAtIndex,
    getPlayerCount,
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
    const readerRef = E(readable).streamBase64();
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
      await E(powers).storeBlob(reader, 'state')
    })
  }

  const gameState = await loadState()

  let game;
  const initGameWithDeck = async (deck) => {
    console.log('init game with deck')
    game = makeGame(gameState, deck, persistState)
  }
  if (await E(powers).has('deck')) {
    const deck = await E(powers).lookup('deck');
    await initGameWithDeck(deck);
  }

  const getCardsAtPlayerLocationGrain = async (remotePlayer) => {
    const { name } = playerRemoteToLocal.get(remotePlayer)
    const locationCardIdsGrain = game.getLocationGrain(name)
    // map location cardIds to CardData
    // TODO: mem leak because we never unsubscribe / subscriptions are not lazy
    const locationCardDataGrain = makeDerivedSyncGrain(
      locationCardIdsGrain,
      locationCardIds => locationCardIds.map(id => game.getCardDataById(id)),
    )
    return makeRemoteGrain(locationCardDataGrain)
  }

  return Far('Game', {
    async setDeck (deckId) {
      console.log('set deck with id', deckId)
      await E(powers).write('deck', deckId);
      const deck = await E(powers).lookup('deck')
      console.log('get deck', deck)
      await initGameWithDeck(deck);
    },
    async start () {
      // TODO: mark game as started,
      // prevent multiple starts, new players etc
      return game.start()
    },
    async newPlayer () {
      // TODO: let users specify their name
      const playerIndex = game.getPlayerCount()
      const playerData = {
        name: `player-${playerIndex}`,
        handIds: [],
      }
      // TODO: simplify
      game.addPlayer(game.makePlayer(game.getCardDataById, playerData))
      return playerIndex
    },
    // TODO: this should be handled by private control interface 
    async playCardByIdFromHand (remoteSourcePlayer, cardId, remoteDestinationPlayer) {
      const localPlayer = playerRemoteToLocal.get(remoteSourcePlayer)
      const localDestinationPlayer = playerRemoteToLocal.get(remoteDestinationPlayer)
      await game.playCardByIdFromHand(localPlayer, cardId, localDestinationPlayer)
    },
    async playerAtIndex (index) {
      // returns the (private) remote interface for player control at the index
      const localPlayer = game.getLocalPlayerAtIndex(index)
      return Far(`Player-${index}`, {
        //
        // generic methods (unpriveleged)
        //
        async getStateGrain () {
          return makeRemoteGrainMap(game.state)
        },
        async getPlayersGrain () {
          return makeRemoteGrain(game.getRemotePlayersGrain())
        },
        async getCurrentPlayerGrain () {
          return makeRemoteGrain(game.getCurrentRemotePlayerGrain())
        },
        getCardsAtPlayerLocationGrain,
        //
        // player specific methods (priveleged)
        //
        async getHandGrain () {
          return makeRemoteGrain(localPlayer.hand)
        },
        async playCardByIdFromHand (cardId, remoteDestinationPlayer) {
          // TODO: check turn
          const localDestinationPlayer = playerRemoteToLocal.get(remoteDestinationPlayer)
          await game.playCardByIdFromHand(localPlayer, cardId, localDestinationPlayer)
        },
      })
    },
  });
};