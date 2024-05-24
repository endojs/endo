import React from 'react';
import { E } from '@endo/far';
import { makeReadonlyArrayGrainFromRemote } from '@endo/grain/captp.js';
import { h, useRaf, useMouse, useAsync, keyForItems, useGrainGetter, useGrain } from './util.js';
import { ObjectsListComponent } from './endo.js';

const getCardRenderer = async (card) => {
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
}

export const CardComponent = ({ card }) => {
  const { value: cardDetails } = useAsync(async () => {
    return await E(card.remote).getDetails()
  }, [card.remote]);
  const mouseData = useMouse()
  const canvasRef = React.useRef(null);
  const { value: render } = useAsync(async () => {
    return await getCardRenderer(card.remote)
  }, [card.remote]);
  useRaf((timeElapsed) => {
    if (!render) return
    const canvas = canvasRef.current;
    if (!canvas) return
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const mousePosition = {
      x: (mouseData.clientX || 0) - rect.x,
      y: (mouseData.clientY || 0) - rect.y,
    };
    render(ctx, rect, mousePosition, timeElapsed)
  }, true, [render, mouseData])

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
      },
    }, [
      h('canvas', {
        key: 'card-art',
        ref: canvasRef,
        style: {
          position: 'absolute',
          width: '100%',
          height: '100%',
        },
      }),
      h('div', {
        key: 'card-body',
        style: {
          position: 'absolute',
          overflow: 'hidden',
          width: '100%',
          height: '100%',
        },
      }, [
        h('div', {
          key: 'card-body-inner',
          style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '100%',
          },
        }, [
          h('span', {
            key: 'title',
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
            },
          }, [cardName]),
          h('pre', {
            key: 'description',
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
            },
          }, [cardDescription]),
        ]),
      ]),
    ])
  )
};

export const CardAndControlsComponent = ({ card, cardControlComponent }) => {
  return (
    h('div', {
      key: keyForItems(card.remote),
    }, [
      h(CardComponent, { card }),
      cardControlComponent && h(cardControlComponent, { card }),
    ])
  )
}

export const CardsDisplayComponent = ({ cards, cardControlComponent, emptyMessage = `( no cards )` }) => {
  const cardsList = cards.map(card => h(CardAndControlsComponent, { card, cardControlComponent }))
  return (
    h('div', {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        minHeight: '336px',
      },
    }, cards.length > 0 ? cardsList : emptyMessage)
  )
}

const getCardDuplicateCount = (cardsData) => {
  const countForCardRemote = new Map()
  for (const card of cardsData) {
    const count = countForCardRemote.get(card.remote) || 0
    countForCardRemote.set(card.remote, count + 1)
  }
  // map back to card data format
  const countForCards = new Map(
    [...countForCardRemote.entries()].map(([cardRemote, count]) => {
      return [cardsData.find(card => card.remote === cardRemote), count]
    }),
  )
  return countForCards
}

export const DeckCardsComponent = ({ deck }) => {
  const cardRemotes = useGrainGetter(
    () => makeReadonlyArrayGrainFromRemote(
      E(deck).getCardsGrain(),
    ),
    [deck],
  )
  // cards as CardData format
  const cards = cardRemotes.map((remote, index) => ({ id: index, remote }))
  const cardsCount = getCardDuplicateCount(cards)
  // map back to CardData format
  // we dont use the card id for anything when building the deck, so we set it to null
  const uniqueCards = [...cardsCount.keys()]

  // specify a component to render under the cards
  const cardControlComponent = ({ card }) => {
    const count = cardsCount.get(card)
    return (
      h('div', {
        key: 'deck-card-controls',
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignContent: 'center',
          alignItems: 'center',
        },
      }, [
        h('span', {
          key: 'count',
          style: {
            margin: '2px',
          },
        }, [`${count}x`]),
        h('button', {
          key: 'remove-button',
          style: {
            margin: '2px',
          },
          onClick: async () => {
            await E(deck).remove(card.remote)
          },
        }, ['Remove from Deck']),
      ])
    )
  }

  return (
    h('div', {}, [
      h('h3', { key: 'title' }, ['Cards in deck']),
      !deck && 'No deck found.',
      h(CardsDisplayComponent, { key: 'cards', cards: uniqueCards, cardControlComponent, emptyMessage: '( No cards in deck. )' }),
    ])
  )
};

export const DeckManagerComponent = ({ deck, deckMgmt, actions }) => {
  const nameStartsWithCard = (name) => name.startsWith('card-')
  const addAction = (name) => {
    return deckMgmt.addCardToDeckByName(name)
  }
  return (
    h('div', {}, [
      h('h2', { key: 'title' }, ['Deck Manager']),
      h('button', {
        key: 'new-deck',
        onClick: async () => {
          await deckMgmt.makeNewDeck()
        },
      }, ['New Deck']),
      deck && h(ObjectsListComponent, { key: 'actions', actions, addAction, filterFn: nameStartsWithCard }),
      deck && h(DeckCardsComponent, { key: 'deck', deck }),
    ])
  )
};

const PlayCardButtonComponent = ({ card, gameMgmt, sourcePlayer, destPlayer }) => {
  const { value: destPlayerName } = useAsync(async () => {
    return await E(destPlayer).getName()
  }, [destPlayer]);
  const playLabel = sourcePlayer === destPlayer ? `Play on self` : `Play on ${destPlayerName}`
  return h('button', {
    key: keyForItems(sourcePlayer, destPlayer),
    style: {
      margin: '2px',
    },
    onClick: async () => {
      await gameMgmt.playCardByIdFromHand(sourcePlayer, card.id, destPlayer)
    },
  }, [playLabel])
}

export const GameCurrentPlayerComponent = ({ gameMgmt, player, players }) => {
  const { value: name } = useAsync(async () => {
    return await E(player).getName()
  }, [player]);
  // const hand = useGrainGetter(
  //   () => makeReadonlyArrayGrainFromRemote(
  //     E(player).getHandGrain(),
  //   ),
  //   [player],
  // )
  const hand = []

  // specify a component to render under the cards
  const cardControlComponent = ({ card }) => {
    const playControls = [
      // first to self
      h(PlayCardButtonComponent, { card, gameMgmt, sourcePlayer: player, destPlayer: player }),
      // then to all other players except self
      ...players.map(otherPlayer => {
        if (otherPlayer === player) {
          return null
        }
        return h(PlayCardButtonComponent, { card, gameMgmt, sourcePlayer: player, destPlayer: otherPlayer })
      }),
    ]
    return (
      h('div', {
        style: {
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
        },
      }, [
        ...playControls,
      ])
    )
  }

  return (
    h('div', {}, [
      h('h3', null, [`Current Player: ${name}`]),
      h(CardsDisplayComponent, { cards: hand, cardControlComponent, emptyMessage: '( No cards in hand. )' }),
    ])
  )
}

export const GamePlayerAreaComponent = ({ game, player, isCurrentPlayer, score }) => {
  const { value: name } = useAsync(async () => {
    return await E(player).getName()
  }, [player]);
  const playerAreaCards = useGrainGetter(
    () => makeReadonlyArrayGrainFromRemote(
      E(game).getCardsAtPlayerLocationGrain(player),
    ),
    [player],
  )

  return (
    h('div', {}, [
      h('h4', null, [`${name} [${score}] ${isCurrentPlayer ? '(current)' : ''}`]),
      h(CardsDisplayComponent, { cards: playerAreaCards, emptyMessage: '( No cards in player area. )' }),
    ])
  )
}

export const ActiveGameComponent = ({ game, gameMgmt, stateGrain }) => {
  const players = useGrainGetter(
    () => stateGrain.getGrain('players'),
    [stateGrain],
  )
  const currentPlayer = useGrainGetter(
    () => stateGrain.getGrain('currentPlayer'),
    [stateGrain],
  )
  const scores = useGrainGetter(
    () => stateGrain.getGrain('scores'),
    [stateGrain],
  )
  const drawStackCount = useGrainGetter(
    () => stateGrain.getGrain('drawStackCount'),
    [stateGrain],
  )
  const log = useGrainGetter(
    () => stateGrain.getGrain('log'),
    [stateGrain],
  )

  return (
    h('div', {
      style: {
        display: 'flex',
      },
    }, [
      h('section', {
        key: 'game-board',
        style: {
          flexGrow: 1,
        },
      }, [
        h('h3', { key: 'title'}, ['Game']),
        h('div', { key: 'draw-stack-count' }, [`Cards remaining in draw stack: ${drawStackCount}`]),
        // log
        h('h3', { key: 'subtitle' }, ['Players']),
        h('div', { key: 'players' }, players && players.map((player, index) => {
          const score = scores ? scores[index] : 0
          return h('div', {
            key: keyForItems(player),
          }, [
            h(GamePlayerAreaComponent, {
              game,
              player,
              isCurrentPlayer: player === currentPlayer,
              score,
            }),
          ])
        })),
        currentPlayer && h(GameCurrentPlayerComponent, { gameMgmt, player: currentPlayer, players }),
      ]),
      h('section', {
        key: 'log',
        style: {
          boxSizing: 'border-box',
          width: '400px',
          border: '2px solid',
          padding: '0 12px',
          background: 'whitesmoke',
        },
      }, [
        h('h3', { key: 'title'}, ['Log']),
        log && h('ul', {
          key: 'log',
          style: {
            padding: '0px 20px',
          },
        }, log.map((entry, index) => {
          return h('li', {
            key: index,
          }, [entry])
        })),
      ]),
    ])
  )
}

export const PlayGameComponent = ({ gameMgmt }) => {
  return (
    h('div', {}, [
      // start game button
      h('button', {
        key: 'start',
        style: {
          margin: '36px',
        },
        onClick: async () => {
          gameMgmt.start()
        },
      }, [
        h('div', {
          key: 'title',
          style: {
            fontSize: '28px',
          },
        }, ['Play Game']),
      ]),
    ])
  )
}
