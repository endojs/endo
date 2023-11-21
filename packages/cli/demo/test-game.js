import '@endo/init/debug.js';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { E } from '@endo/far';
import { make as makeGame } from './game.js';
import { make as makeDeck } from './deck.js';
import { makeDerivedSyncGrain, makeReadonlyArrayGrainFromRemote, makeSyncGrainFromFollow } from './grain.js';

import { make as makeCard } from './cards/firmament.js';

const followToGrain = (rawFollow, initValue) => {
  const grainFollow = makeRefIterator(rawFollow)
  const grain = makeSyncGrainFromFollow(grainFollow, initValue)
  return grain
}

main()

async function main () {


  const game = makeGame()
  // followToGrain(game.followPlayers()).subscribe(players => {
  //   console.log({players})
  // })
  // followToGrain(game.followState()).subscribe(state => {
  //   console.log({state})
  // })
  // followToGrain(game.followCurrentPlayer()).subscribe(currentPlayer => {
  //   console.log({currentPlayer})
  // })

  // NOTE: deck updates not fully showing up in game state
  const deck = makeDeck()
  await E(deck).add(makeCard());
  await E(deck).add(makeCard());
  // await E(deck).add(makeCard());
  // await E(deck).add(makeCard());
  // await E(deck).add(makeCard());
  // await E(deck).add(makeCard());
  // await E(deck).add(makeCard());
  // await E(deck).add(makeCard());
  // console.log('START>>>', await E(deck).getCards())

  await E(game).start(deck)

  const playersGrain = makeReadonlyArrayGrainFromRemote(E(game).getPlayersGrain())
  playersGrain.subscribe(players => {
    console.log({players})
  })
  const firstPlayerGrain = makeDerivedSyncGrain(playersGrain, players => players[0])

  // const remoteGrain = E(game).getCardsAtPlayerLocationGrain(player)
  // const playerLocationCards = makeReadonlyArrayGrainFromRemote(remoteGrain)
}

// TODO: investigate:

// current turn phase undefined?
// deck length updated before deck?
// followToGrain not getting updates for state?
