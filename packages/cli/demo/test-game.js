import '@endo/init/debug.js';
import { E } from '@endo/far';
import { makeReadonlyArrayGrainFromRemote } from '@endo/grain/captp.js';
import { make as makeGame } from './game.js';
import { make as makeDeck } from './deck.js';
import { make as makeCard } from './cards/firmament.js';

main()

async function main () {
  const game = makeGame()

  const deck = makeDeck()
  await E(deck).add(makeCard());
  await E(deck).add(makeCard());

  await E(game).start(deck)

  const playersGrain = makeReadonlyArrayGrainFromRemote(E(game).getPlayersGrain())
  playersGrain.subscribe(players => {
    console.log({players})
  })
}
