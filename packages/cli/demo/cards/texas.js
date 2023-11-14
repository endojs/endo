import { Far } from "@endo/far"

export const make = (powers) => {
  return Far('goto texas', {
    async play (game) {
      const card = await E(game).targetCard()
      await E(game).setLocation(card, 'texas')
    },
    getRendererCode () {
      return `${function(){}}`
    },
  })
}