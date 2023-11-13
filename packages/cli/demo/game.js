import { E, Far } from '@endo/far';
// import { makeRefIterator } from '@endo/daemon/ref-reader.js';

class Player {
  constructor (name) {
    this.name = name
    this.hand = []
  }
  addCard (card) {
    this.hand.push(card)
  }
  async chooseCard () {
    return this.hand.pop()
  }
}

export const make = (powers) => {
  const game = makeGame()
  const controller = makeGameController(game)
  game.addPlayer(new Player('alice'))
  game.addPlayer(new Player('bob'))
  return Far('Game', {
    async start (deck) {
      // await E(powers).request('HOST', 'deck for game', 'deck')
      await game.importDeck(deck)
      // game.shuffleDeck()
      // await controller.takeTurn()
    }
  });
};


export function makeGame () {

  const state = {
    currentPlayer: 0,
    players: [],
    deck: [],
  }
  
  const getState = () => {
    return state
  }
  const getCurrentPlayer = () => {
    return state.players[state.currentPlayer]
  }
  const addPlayer = (player) => {
    state.players.push(player)
  }
  const addCardToDeck = (card) => {
    state.deck.push(card)
  }
  const drawCard = () => {
    return state.deck.pop()
  }
  const importDeck = async (deck) => {
    // for await (const card of makeRefIterator(E(deck).getCards())) {
    for await (const card of await E(deck).getCards()) {
      addCardToDeck(card)
    }
  }
  const shuffleDeck = () => {
    for (let i = state.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.deck[i], state.deck[j]] = [state.deck[j], state.deck[i]];
    }
  }

  // Far
  return {
    getState,
    getCurrentPlayer,
    addPlayer,
    addCardToDeck,
    drawCard,

    importDeck,
    shuffleDeck,
  }

}

export function makeGameController (game) {
  const takeTurn = async () => {
    const currentPlayer = game.getCurrentPlayer()
    const newCard = game.drawCard()
    await currentPlayer.addCard(newCard)
    // const playedCard = await currentPlayer.chooseCard()
    // whats appropriate to give to a card?
    // its funny because it should be able to do anything
    // but this is an example of an ocap system
    // await playedCard.play(game)
  }
  // Far
  return {
    takeTurn,
  }
}