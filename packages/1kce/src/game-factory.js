

const adminSrc = `
let players = [];
Far('Admin', {
  newPlayer: async () => {
    players.push({});
    return players.length - 1;
  },
  playerAtIndex: async (playerIndex) => {
    return players[playerIndex];
  },
})
`
const factorySrc = `
Far('PlayerFactory', {
  makePlayer: async (playerIndex) => {
    const playerSrc = \`admin.playerAtIndex(\${playerIndex})\`;
    const resultName = \`player-\${playerIndex}\`;
    await E(powers).evaluate('MAIN', playerSrc, ['admin'], ['admin'], resultName)
    const resultId = await E(powers).identify(resultName);
    return resultId;
  },
})
`
const clientSrc = `
Far('Client', {
  joinGame: async () => {
    const playerIndex = await admin.newPlayer();
    const resultId = await playerFactory.makePlayer(playerIndex)
    return resultId;
  }
})
`


export const make = async (powers) => {
  let admin;
  if (await E(powers).has('admin')) {
    admin = await E(powers).lookup('admin');
  } else {
    admin = await E(powers).evaluate(
      'MAIN',
      adminSrc,
      // no powers required (yet)
      [], [],
      'admin'
    )
  }
  let factory;
  if (await E(powers).has('factory')) {
    factory = await E(powers).lookup('factory');
  } else {
    factory = await E(powers).evaluate(
      'MAIN',
      factorySrc,
      // needs to be able to make evals
      ['powers'], ['AGENT'],
      'factory'
    )
  }
  let client;
  if (await E(powers).has('client')) {
    client = await E(powers).lookup('client');
  } else {
    client = await E(powers).evaluate(
      'MAIN',
      clientSrc,
      // needs admin and factory
      ['admin', 'playerFactory'], ['admin', 'factory'],
      'client'
    )
  }
  return { admin, client }
}
