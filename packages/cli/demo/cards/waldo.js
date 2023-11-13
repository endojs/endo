import { Far } from "@endo/far"

export const make = (powers) => {
  return Far('you found waldo', {
    async play (game) {
      await E(game).currentPlayerScores(10)
    }
  })
}