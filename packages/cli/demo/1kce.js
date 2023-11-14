/* global window document */

import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { createRoot } from 'react-dom/client';
import React from 'react';

const h = React.createElement;
const useAsync = (asyncFn, deps) => {
  const [state, setState] = React.useState({
    loading: true,
    error: null,
    value: null,
  });
  React.useEffect(() => {
    let didAbort = false
    setState({
      loading: true,
      error: null,
      value: null,
    });
    asyncFn()
      .then(value => {
        if (didAbort) {
          return;
        }
        setState({
          loading: false,
          error: null,
          value,
        });
      })
      .catch(error => {
        if (didAbort) {
          return;
        }
        setState({
          loading: false,
          error,
          value: null,
        });
      });
    return () => {
      didAbort = true;
    }
  }, deps);
  return state;
}

// subscribes to Endo Topic changes
const useSubscriptionForArray = (sub) => {
  const [state, setState] = React.useState([]);

  React.useEffect(() => {
    if (sub === undefined) {
      return;
    }
    let shouldAbort = false;
    const iterateChanges = async () => {
      for await (const change of sub) {
        // Check if we should abort iteration
        if (shouldAbort) {
          break;
        }
        // apply change
        setState(prevState => {
          if ('add' in change) {
            const name = change.add;
            return [...prevState, name];
          } else if ('remove' in change) {
            const name = change.remove;
            return prevState.filter(n => n !== name);
          }
          return prevState;
        });
      }
    }
    // start iteration
    iterateChanges()
    // cleanup
    return () => {
      shouldAbort = true;
    }
  }, [sub]);

  return state;
}

// subscribes to Endo Topic changes
const useSubscriptionForValue = (sub) => {
  const [state, setState] = React.useState();

  React.useEffect(() => {
    if (sub === undefined) {
      return;
    }
    let shouldAbort = false;
    const iterateChanges = async () => {
      for await (const change of sub) {
        // Check if we should abort iteration
        if (shouldAbort) {
          break;
        }
        // apply change
        setState(change.value);
      }
    }
    // start iteration
    iterateChanges()
    // cleanup
    return () => {
      shouldAbort = true;
    }
  }, [sub]);

  return state;
}

const makeThing = async (powers, importFullPath, resultName) => {
  const workerName = 'MAIN';
  const powersName = 'NONE';
  const deck = await E(powers).importUnsafeAndEndow(
    workerName,
    importFullPath,
    powersName,
    resultName,
  );
  return deck
}

const makeNewDeck = async (powers) => {
  const importPath = './deck.js';
  const importFullPath = '/home/xyz/Development/endo/packages/cli/demo/deck.js';
  const resultName = 'deck';
  return await makeThing(powers, importFullPath, resultName)
}

const makeGame = async (powers) => {
  const importPath = './game.js';
  const importFullPath = '/home/xyz/Development/endo/packages/cli/demo/game.js';
  const resultName = 'game';
  return await makeThing(powers, importFullPath, resultName)
}

const DeckCardsCardComponent = ({ actions, card }) => {
  const { value: nickname } = useAsync(async () => {
    if (card === undefined) {
      return '<no card>';
    }
    return await actions.reverseLookupCard(card)
  }, [card]);
  return (
    h('div', {}, [
      h('span', null, [nickname]),
    ])
  )
};

const DeckCardsComponent = ({ actions, deck }) => {
  const sub = React.useMemo(
    () => deck && makeRefIterator(E(deck).follow()),
    [deck]
  )
  const cards = useSubscriptionForArray(sub)
  let cardsList
  if (deck === undefined) {
    cardsList = 'No deck found.'
  } else {
    if (cards.length === 0) {
      cardsList = 'No cards in deck.'
    } else {
      cardsList = cards.map(card => {
        return h('li', null, [
          h(DeckCardsCardComponent, { actions, card })
        ])
      })
    }
  }

  return (
    h('div', {}, [
      h('h3', null, ['Cards in deck']),
      h('ul', null, cardsList),
    ])
  )
};

const DeckManagerComponent = ({ actions, deck }) => {
  return (
    h('div', {}, [
      h('h2', null, ['Deck Manager']),
      h('button', {
        onClick: async () => {
          await actions.makeNewDeck()
        }
      }, ['New Deck']),
      h(DeckCardsComponent, { actions, deck }),
      deck && h(ObjectsListComponent, { actions }),
    ])
  )
};

const ActiveGamePlayerComponent = ({ actions, player, isCurrentPlayer }) => {
  const { value: name } = useAsync(async () => {
    return await E(player).getName()
  }, [player]);
  const handSub = React.useMemo(
    () => player && makeRefIterator(E(player).followHand()),
    [player]
  )
  const hand = useSubscriptionForArray(handSub)

  return (
    h('div', {}, [
      h('span', null, [`${name} ${isCurrentPlayer ? '(current)' : ''}`]),
      h('ul', null, hand && hand.map(card => {
        return h('li', null, [
          h(DeckCardsCardComponent, { actions, card }),
          isCurrentPlayer && h('button', {
            onClick: async () => {
              actions.playCardFromHand(player, card)
            }
          }, ['Play']),
        ])
      })),
    ])
  )
}

const ActiveGameComponent = ({ actions, game }) => {
  const { value: players } = useAsync(async () => {
    return await E(game).getPlayers()
  }, [game]);
  // const { value: gameState } = useAsync(async () => {
  //   return await E(game).getState()
  // }, [game]);
  const stateSub = React.useMemo(() => makeRefIterator(E(game).followState()), [game])
  const gameState = useSubscriptionForValue(stateSub)
  const sub = React.useMemo(() => makeRefIterator(E(game).followCurrentPlayer()), [game])
  const currentPlayer = useSubscriptionForValue(sub)
  console.log('currentPlayer', currentPlayer)

  return (
    h('div', {}, [
      h('h3', null, ['Game']),
      h('pre', null, JSON.stringify(gameState, null, 2)),
      h('h3', null, ['Players']),
      h('ul', null, players && players.map(player => {
        return h('li', null, [
          h(ActiveGamePlayerComponent, {
            actions,
            player,
            isCurrentPlayer: player === currentPlayer
          })
        ])
      })),
    ])
  )
}

const PlayGameComponent = ({ actions, game }) => {
  return (
    h('div', {}, [
      h('h2', null, ['Play Game']),
      !game && h('button', {
        onClick: async () => {
          actions.start()
        }
      }, ['Start']),
      game && h(ActiveGameComponent, { actions, game }),
    ])
  )
}

const ObjectsListObjectComponent = ({ actions, name }) => {
  return (
    h('div', {}, [
      h('span', null, [name]),
      h('button', {
        onClick: async () => {
          await actions.removeName(name)
        }
      }, ['Remove']),
      h('button', {
        onClick: async () => {
          await actions.addCardToDeckByName(name)
        }
      }, ['Add to Deck']),
    ])
  )
}

const ObjectsListComponent = ({ actions }) => {
  const sub = React.useMemo(
    () => actions.subscribeToNames(),
    []
  )
  // pet store topic doesnt send removals when overwriting existing names
  const names = useSubscriptionForArray(sub)
  const uniqueNames = [...new Set(names)]

  let objectList
  if (uniqueNames.length === 0) {
    objectList = 'No objects found.'
  } else {
    objectList = uniqueNames.map(name => {
      return h('li', null, [
        h('span', null, [
          h(ObjectsListObjectComponent, { actions, name })
        ]),
      ])
    })
  }
  
  return (
    h('div', {}, [
      h('h3', null, ['Inventory']),
      h('ul', null, objectList),
    ])
  )

};

const App = ({ powers }) => {

  const [deck, setDeck] = React.useState(undefined);
  const [game, setGame] = React.useState(undefined);

  const actions = {
    // deck mgmt
    async fetchDeck () {
      // workaround for https://github.com/endojs/endo/issues/1843
      if (await E(powers).has('deck')) {
        const deck = await E(powers).lookup('deck')
        setDeck(deck)
      }
    },
    async makeNewDeck () {
      const deck = await makeNewDeck(powers)
      setDeck(deck)
    },
    async addCardToDeck (card) {
      await E(deck).add(card);
    },
    async addCardToDeckByName (cardName) {
      const card = await E(powers).lookup(
        cardName,
      )
      await E(deck).add(card);
    },
    async reverseLookupCard (card) {
      return await E(powers).reverseLookup(card)
    },

    // inventory
    subscribeToNames () {
      return makeRefIterator(E(powers).followNames())
    },
    async removeName (name) {
      await E(powers).remove(name)
    },

    // game
    async start () {
      // make game
      const game = await makeGame(powers)
      setGame(game)
      console.log('start', deck, game)
      await E(game).start(deck)
    },
    async playCardFromHand (player, card) {
      await E(game).playCardFromHand(player, card)
    },
  }

  // on first render
  React.useEffect(() => {
    actions.fetchDeck()
  }, []);

  return (
    h('div', {}, [
      h('h1', null, ['🃏']),
      !game && h(DeckManagerComponent, { actions, deck }),
      // h(FollowMessagesComponent, { powers }),
      deck && h(PlayGameComponent, { actions, game }),
    ])
  )
};

export const make = async powers => {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(h(App, { powers }));
};
