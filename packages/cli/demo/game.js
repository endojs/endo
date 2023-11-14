import { E, Far } from '@endo/far';
import { makeIteratorRef } from '@endo/daemon/reader-ref.js';
import { makeTrackedArray, makeTrackedValue } from './util.js';

class Player {
  constructor (name) {
    this.name = name
    this.hand = makeTrackedArray()
    const player = this
    this.remoteInterface = Far('Player', {
      getName () {
        return player.name
      },
      followHand () {
        return makeIteratorRef(player.hand.follow())
      },
      removeCard (card) {
        player.removeCard(card)
      }
    })
  }
  addCard (card) {
    this.hand.push(card)
  }
  removeCard (card) {
    this.hand.splice(this.hand.indexOf(card), 1)
  }
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
      await game.takeTurn()
    },
    async playCardFromHand (player, card) {
      await game.playCardFromHand(player, card)
    },
    async getPlayers () {
      return game.getPlayers()
    },
    async followState () {
      return makeIteratorRef(game.followState())
    },
    async followCurrentPlayer () {
      return makeIteratorRef(game.followCurrentPlayer())
    },
    async getState () {
      return game.getState()
    },
  });
};


export function makeGame () {

  const state = makeTrackedValue({
    currentPlayer: 0,
    deck: [],
    points: [],
  })
  const players = []
  const currentPlayer = makeTrackedValue()
  
  const getState = () => {
    return state.get()
  }
  const followState = () => {
    return state.follow()
  }
  const getCurrentPlayer = () => {
    return players[state.get().currentPlayer]
  }
  const getPlayers = () => {
    return players.map(player => {
      return player.remoteInterface
    })
  }
  const addPlayer = (player) => {
    players.push(player)
    state.set({
      ...state.get(),
      points: [...state.get().points, 0]
    })
    // set current player if currently undefined
    if (currentPlayer.get() === undefined) {
      currentPlayer.set(players[state.get().currentPlayer].remoteInterface)
    }
  }
  const addCardToDeck = (card) => {
    state.get().deck.push(card)
  }
  const importDeck = async (deck) => {
    // for await (const card of makeRefIterator(E(deck).getCards())) {
    for await (const card of await E(deck).getCards()) {
      addCardToDeck(card)
    }
  }
  const shuffleDeck = () => {
    for (let i = state.get().deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.get().deck[i], state.get().deck[j]] = [state.get().deck[j], state.get().deck[i]];
    }
  }

  const drawCard = () => {
    return state.get().deck.pop()
  }
  const playerDrawsCards = (player, numCards) => {
    for (let i = 0; i < numCards; i++) {
      player.addCard(drawCard())
    }
  }
  const drawInitialCards = () => {
    for (let i = 0; i < players.length; i++) {
      playerDrawsCards(players[i], 3)
    }
  }

  const takeTurn = async () => {
    const currentPlayer = game.getCurrentPlayer()
    playerDrawsCards(currentPlayer, 1)
  }
  const advanceCurrentPlayer = () => {
    state.set(
      {
        ...state.get(),
        currentPlayer: (state.get().currentPlayer + 1) % players.length
      }
    )
    currentPlayer.set(players[state.get().currentPlayer].remoteInterface)
  }
  const playCardFromHand = async (player, card) => {
    // remove card from hand
    player.removeCard(card)
    // add card to discard pile
    // trigger card effect
    // const playedCard = await currentPlayer.chooseCard()
    // whats appropriate to give to a card?
    // its funny because it should be able to do anything
    // but this is an example of an ocap system
    const controller = makeGameController(game)
    await E(card).play(controller)
    // next player
    advanceCurrentPlayer()
  }

  const currentPlayerScores = async (points) => {
    const { currentPlayer } = state.get()
    state.set({
      ...state.get(),
      points: [
        ...state.get().points.slice(0, currentPlayer),
        state.get().points[currentPlayer] + points,
        ...state.get().points.slice(currentPlayer + 1)
      ]
    })
  }

  // Far
  const game = {
    getState,
    followState,
    getPlayers,
    getCurrentPlayer,
    followCurrentPlayer: () => {
      return currentPlayer.follow()
    },
    addPlayer,
    addCardToDeck,
    takeTurn,
    drawCard,
    drawInitialCards,
    playCardFromHand,
    currentPlayerScores,

    importDeck,
    shuffleDeck,
  }
  return game
}

// exposed to cards when played
export function makeGameController (game) {
  return Far('GameController', {
    currentPlayerScores (points) {
      game.currentPlayerScores(points)
    }
  })
}