/* global window document */

import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { createRoot } from 'react-dom/client';
import React from 'react';
import { makeSyncGrainFromFollow } from './grain.js';

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

// subscribes to Endo Topic changes, optimized for arrays
// YIKES: THIS IS NOT WORKING CORRECTLY !!!!
const useBrokenSubscriptionForArray = (getSubFn, deps) => {
  const [state, setState] = React.useState([]);

  React.useEffect(() => {
    setState([]);
    const sub = getSubFn()
    if (sub === undefined) {
      console.warn('sub is undefined')
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
            prevState.splice(prevState.indexOf(name), 1);
            return prevState;
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
  }, deps);

  return state;
}

// // grain follow via async iteration
// const useGrainFollow = (grainFollowGetter, deps, initValue) => {
//   const [grainValue, setGrainValue] = React.useState(initValue);

//   React.useEffect(() => {
//     let abort = false;
//     let cancel;
//     const canceled = new Promise(resolve => { cancel = resolve });
//     const grainFollow = grainFollowGetter(canceled);
//     if (grainFollow === undefined) return;
//     (async () => {
//       for await (const value of grainFollow) {
//         if (abort) break;
//         setGrainValue(value);
//       }
//     })();
//     return () => {
//       abort = true;
//       cancel();
//     }
//   }, deps);

//   return grainValue;
// }

// grain follow via subscribe (should be same as async iteration useGrainFollow)
const useGrainFollow = (grainFollowGetter, deps, initValue) => {
  const [grainValue, setGrainValue] = React.useState(initValue);

  React.useEffect(() => {
    let cancel;
    const canceled = new Promise(resolve => { cancel = resolve });
    const grainFollow = grainFollowGetter(canceled);
    if (grainFollow === undefined) return;
    const grain = makeSyncGrainFromFollow(grainFollow, initValue)
    const unsubscribe = grain.subscribe(value => {
      setGrainValue(value)
    })
    return () => {
      unsubscribe();
      cancel();
    }
  }, deps);

  return grainValue;
}

// grain follow, specialized for arrays
const useArrayGrainFollow = (getSubFn, deps) => {
  return useGrainFollow(getSubFn, deps, [])
}

const useRaf = (
  callback,
  isActive,
) => {
  const savedCallback = React.useRef();
  // Remember the latest function.
  React.useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  React.useEffect(() => {
    let animationFrame;
    let startTime = Date.now();

    function tick() {
      const timeElapsed = Date.now() - startTime;
      startTime = Date.now();
      loop();
      savedCallback.current?.(timeElapsed);
    }

    function loop() {
      animationFrame = requestAnimationFrame(tick);
    }

    if (isActive) {
      startTime = Date.now();
      loop();

      return () => {
        if (animationFrame) {
          cancelAnimationFrame(animationFrame);
        }
      };
    }
  }, [isActive]);
}

function getMousePositionFromEvent(event) {
  const {
    screenX,
    screenY,
    movementX,
    movementY,
    pageX,
    pageY,
    clientX,
    clientY,
    offsetX,
    offsetY,
  } = event;

  return {
    clientX,
    clientY,
    movementX,
    movementY,
    offsetX,
    offsetY,
    pageX,
    pageY,
    screenX,
    screenY,
    x: screenX,
    y: screenY,
  };
}

/**
 * useMouse hook
 *
 * Retrieves current mouse position and information about the position like
 * screenX, pageX, clientX, movementX, offsetX
 * @see https://rooks.vercel.app/docs/useMouse
 */
export function useMouse() {
  const [mousePosition, setMousePosition] =
    React.useState({});

  function updateMousePosition(event) {
    setMousePosition(getMousePositionFromEvent(event));
  }

  React.useEffect(() => {
    document.addEventListener("mousemove", updateMousePosition);

    return () => {
      document.removeEventListener("mousemove", updateMousePosition);
    };
  }, []);

  return mousePosition;
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
  const { value: cardDetails } = useAsync(async () => {
    return await actions.getCardDetails(card)
  }, [card]);
  const mouseData = useMouse()
  const canvasRef = React.useRef(null);
  const { value: render } = useAsync(async () => {
    return await actions.getCardRenderer(card)
  }, [card]);
  useRaf((timeElapsed) => {
    if (!render) return
    const canvas = canvasRef.current;
    if (!canvas) return
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const mousePosition = {
      x: (mouseData.clientX || 0) - rect.x,
      y: (mouseData.clientY || 0) - rect.y,
    };
    render(ctx, rect, mousePosition, timeElapsed)
  }, true)

  const cardName = cardDetails?.name || '<no name>'
  const cardDescription = cardDetails?.description || '<no description>'

  return (
    h('div', {
      style: {
        background: 'white',
        border: '2px solid black',
        width: '200px',
        height: '320px',
        borderRadius: '10px',
        margin: '6px',
        flexShrink: 0,
        flexGrow: 0,
        overflow: 'hidden',
        position: 'relative',
      }
    }, [
      h('canvas', {
        ref: canvasRef,
        style: {
          position: 'absolute',
          width: '100%',
          height: '100%',
        }
      }),
      h('div', {
        style: {
          position: 'absolute',
          overflow: 'hidden',
          width: '100%',
          height: '100%',
        },
      }, [
        h('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '100%',
          }
        }, [
          h('span', {
            title: cardName,
            style: {
              margin: '8px 12px',
              padding: '6px 4px',
              border: '2px solid',
              borderRadius: '8px',
              borderTopColor: 'rgba(225, 213, 153, 0.75)',
              borderLeftColor: 'rgba(225, 213, 153, 0.75)',
              borderBottomColor: 'rgba(39, 34, 9, 0.75)',
              borderRightColor: 'rgba(39, 34, 9, 0.75)',
              background: 'rgba(175, 152, 43, 0.75)',
              color: 'aliceblue',
              fontWeight: 'bold',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              cursor: 'default',
            }
          }, [cardName]),
          h('pre', {
            style: {
              margin: '8px 12px',
              padding: '6px 4px',
              border: '2px solid',
              borderRadius: '8px',
              borderTopColor: 'rgba(225, 225, 225, 0.75)',
              borderLeftColor: 'rgba(225, 225, 225, 0.75)',
              borderBottomColor: 'rgba(32, 32, 32, 0.75)',
              borderRightColor: 'rgba(32, 32, 32, 0.75)',
              background: 'rgba(78, 78, 78, 0.85)',
              color: 'aliceblue',
              cursor: 'default',
              whiteSpace: 'pre-wrap',
            }
          }, [cardDescription]),
        ])
      ]),
    ])
  )
};

const CardsDisplayComponent = ({ actions, cards, cardControlComponent }) => {
  const cardsList = cards.map(card => {
    return (
      h('div', null, [
        h(DeckCardsCardComponent, { actions, card }),
        cardControlComponent && h(cardControlComponent, { card }),
      ])
    )
  })
  return (
    h('div', {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
      }
    }, cards.length > 0 ? cardsList : '(no cards)')
  )
}

const DeckCardsComponent = ({ actions, deck }) => {
  const cards = useArrayGrainFollow(
    (canceled) => makeRefIterator(E(deck).follow(canceled)),
    [deck]
  )

  return (
    h('div', {}, [
      h('h3', null, ['Cards in deck']),
      !deck && 'No deck found.',
      cards.length === 0 && 'No cards in deck.',
      cards.length > 0 && h(CardsDisplayComponent, { actions, cards }),
    ])
  )
};

const DeckManagerComponent = ({ actions, deck }) => {
  return (
    h('div', {}, [
      h('h2', null, ['Deck Manager']),
      deck && h(ObjectsListComponent, { actions }),
      h('button', {
        onClick: async () => {
          await actions.makeNewDeck()
        }
      }, ['New Deck']),
      deck && h(DeckCardsComponent, { actions, deck }),
    ])
  )
};

const GameCurrentPlayerComponent = ({ actions, player, players }) => {
  const { value: name } = useAsync(async () => {
    return await E(player).getName()
  }, [player]);
  const hand = useArrayGrainFollow(
    (canceled) => actions.followPlayerHand(player, canceled),
    [player]
  )

  // specify a component to render under the cards
  const cardControlComponent = ({ card }) => {
    const makePlayCardButton = ({ sourcePlayer, destPlayer }) => {
      const playLabel = sourcePlayer === destPlayer ? `Play on self` : `Play on ${destPlayer}`
      return h('button', {
        style: {
          margin: '2px',
        },
        onClick: async () => {
          await actions.playCardFromHand(sourcePlayer, card, destPlayer)
        }
      }, [playLabel])
    }
    const playControls = [
      // first to self
      makePlayCardButton({ sourcePlayer: player, destPlayer: player }),
      // then to all other players except self
      ...players.map(otherPlayer => {
        if (otherPlayer === player) {
          return null
        }
        return makePlayCardButton({ sourcePlayer: player, destPlayer: otherPlayer })
      })
    ]
    return (
      h('div', {
        style: {
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
        }
      }, [
        ...playControls,
      ])
    )
  }

  return (
    h('div', {}, [
      h('h3', null, [`Current Player: ${name}`]),
      h(CardsDisplayComponent, { actions, cards: hand, cardControlComponent }),
    ])
  )
}

const GamePlayerAreaComponent = ({ actions, player, isCurrentPlayer }) => {
  const { value: name } = useAsync(async () => {
    return await E(player).getName()
  }, [player]);
  const playerAreaCards = useArrayGrainFollow(
    (canceled) => actions.followCardsAtPlayerLocation(player, canceled),
    [player]
  )

  return (
    h('div', {}, [
      h('h4', null, [`${name} ${isCurrentPlayer ? '(current)' : ''}`]),
      h(CardsDisplayComponent, { actions, cards: playerAreaCards }),
    ])
  )
}

const ActiveGameComponent = ({ actions, game }) => {
  const players = useArrayGrainFollow(
    (canceled) => makeRefIterator(E(game).followPlayers(canceled)),
    [game]
  )
  const gameState = useGrainFollow(
    (canceled) => makeRefIterator(E(game).followState(canceled)),
    [game]
  )
  const currentPlayer = useGrainFollow(
    (canceled) => makeRefIterator(E(game).followCurrentPlayer(canceled)),
    [game]
  )

  return (
    h('div', {}, [
      h('h3', null, ['Game']),
      h('pre', null, JSON.stringify(gameState, null, 2)),
      h('h3', null, ['Players']),
      h('div', null, players && players.map(player => {
        return h('div', null, [
          h(GamePlayerAreaComponent, {
            actions,
            player,
            isCurrentPlayer: player === currentPlayer
          })
        ])
      })),
      currentPlayer && h(GameCurrentPlayerComponent, { actions, player: currentPlayer, players }),
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
          await actions.addCardToDeckByName(name)
        },
        style: {
          margin: '6px',
        }
      }, ['Add to Deck']),
    ])
  )
}

const ObjectsListComponent = ({ actions }) => {
  const names = useBrokenSubscriptionForArray(
    () => actions.subscribeToNames(),
    []
  )
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

// for debugging
const GrainComponent = ({ grain }) => {
  const grainValue = useGrainFollow(
    (canceled) => makeRefIterator(grain.follow(canceled)),
    [game]
  )

  return (
    h('pre', null, [
      grainValue ? JSON.stringify(grainValue, null, 2) : 'no grain',
    ])
  )
}

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
    async getCardDetails (card) {
      return await E(card).getDetails()
    },
    async getCardRenderer (card) {
      let renderer
      try {
        const code = await E(card).getRendererCode()
        const compartment = new Compartment({ Math, console })
        const makeRenderer = compartment.evaluate(`(${code})`)
        renderer = makeRenderer()
      } catch (err) {
        console.error(err)
        // ignore missing or failed renderer
        renderer = () => {}
      }
      return renderer
    },
    // getCardsAtLocation (location, canceled) {
    //   return makeRefIterator(E(game).getCardsAtLocation(location, canceled))
    // },
    followCardsAtPlayerLocation (player, canceled) {
      return makeRefIterator(E(game).followCardsAtPlayerLocation(player, canceled))
    },
    followPlayerHand (player, canceled) {
      return makeRefIterator(E(player).followHand(canceled))
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
      await E(game).start(deck)
    },
    async playCardFromHand (player, card, destinationPlayer) {
      await E(game).playCardFromHand(player, card, destinationPlayer)
    },
  }

  // on first render
  React.useEffect(() => {
    actions.fetchDeck()
  }, []);

  return (
    h('div', {}, [
      h('h1', {
        style: {
          display: 'inline',
          border: '2px solid black',
          borderRadius: '12px',
          padding: '4px',
          background: 'white',
          fontSize: '42px',
        }
      }, ['🃏1kce🃏']),
      !game && h(DeckManagerComponent, { actions, deck }),
      // h(FollowMessagesComponent, { powers }),
      deck && h(PlayGameComponent, { actions, game }),
    ])
  )
};

export const make = async powers => {
  document.body.innerHTML = '';

  const style = document.createElement('style');
  style.innerHTML = `
    html, body {
      box-sizing: border-box;
      margin: 0;
      height: 100%;
    }
    body {
      padding: 12px;
      font-family: sans-serif;
      background: #e3e3e3;
    }
  `;
  document.body.appendChild(style);

  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(h(App, { powers }));
};
