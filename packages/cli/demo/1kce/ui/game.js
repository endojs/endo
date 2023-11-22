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
    return await E(card).getDetails()
  }, [card]);
  const mouseData = useMouse()
  const canvasRef = React.useRef(null);
  const { value: render } = useAsync(async () => {
    return await getCardRenderer(card)
  }, [card]);
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

export const CardsDisplayComponent = ({ cards, cardControlComponent }) => {
  const cardsList = cards.map(card => {
    return (
      h('div', {
        key: keyForItems(card),
      }, [
        h(CardComponent, { card }),
        cardControlComponent && h(cardControlComponent, { card }),
      ])
    )
  })
  return (
    h('div', {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
      },
    }, cards.length > 0 ? cardsList : '(no cards)')
  )
}

export const DeckCardsComponent = ({ deck }) => {
  const cards = useGrainGetter(
    () => makeReadonlyArrayGrainFromRemote(
      E(deck).getCardsGrain(),
    ),
    [deck],
  )

  return (
    h('div', {}, [
      h('h3', { key: 'title' }, ['Cards in deck']),
      !deck && 'No deck found.',
      cards.length === 0 && 'No cards in deck.',
      cards.length > 0 && h(CardsDisplayComponent, { key: 'cards', cards }),
    ])
  )
};

export const DeckManagerComponent = ({ deck, deckMgmt, inventory }) => {
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
      deck && h(ObjectsListComponent, { key: 'inventory', inventory, addAction }),
      deck && h(DeckCardsComponent, { key: 'deck', deck }),
    ])
  )
};

export const GameCurrentPlayerComponent = ({ gameMgmt, player, players }) => {
  const { value: name } = useAsync(async () => {
    return await E(player).getName()
  }, [player]);
  const hand = useGrainGetter(
    () => makeReadonlyArrayGrainFromRemote(
      E(player).getHandGrain(),
    ),
    [player],
  )

  // specify a component to render under the cards
  const cardControlComponent = ({ card }) => {
    const makePlayCardButton = ({ sourcePlayer, destPlayer }) => {
      const playLabel = sourcePlayer === destPlayer ? `Play on self` : `Play on ${destPlayer}`
      return h('button', {
        key: keyForItems(sourcePlayer, destPlayer),
        style: {
          margin: '2px',
        },
        onClick: async () => {
          await gameMgmt.playCardFromHand(sourcePlayer, card, destPlayer)
        },
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
      h(CardsDisplayComponent, { cards: hand, cardControlComponent }),
    ])
  )
}

export const GamePlayerAreaComponent = ({ game, player, isCurrentPlayer }) => {
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
      h('h4', null, [`${name} ${isCurrentPlayer ? '(current)' : ''}`]),
      h(CardsDisplayComponent, { cards: playerAreaCards }),
    ])
  )
}

export const ActiveGameComponent = ({ game, gameMgmt, stateGrain }) => {
  const gameState = useGrain(stateGrain)
  const players = useGrainGetter(
    () => stateGrain.getGrain('players'),
    [stateGrain],
  )
  const currentPlayer = useGrainGetter(
    () => stateGrain.getGrain('currentPlayer'),
    [stateGrain],
  )

  return (
    h('div', {}, [
      h('h3', { key: 'title'}, ['Game']),
      h('pre', { key: 'gamestate' }, JSON.stringify(gameState, null, 2)),
      h('h3', { key: 'subtitle' }, ['Players']),
      h('div', { key: 'players' }, players && players.map(player => {
        return h('div', {
          key: keyForItems(player),
        }, [
          h(GamePlayerAreaComponent, {
            game,
            player,
            isCurrentPlayer: player === currentPlayer,
          }),
        ])
      })),
      currentPlayer && h(GameCurrentPlayerComponent, { gameMgmt, player: currentPlayer, players }),
    ])
  )
}

export const PlayGameComponent = ({ game, stateGrain, gameMgmt }) => {
  return (
    h('div', {}, [
      h('h2', {
        key: 'title',
      }, ['Play Game']),
      !game && h('button', {
        key: 'start',
        onClick: async () => {
          gameMgmt.start()
        },
      }, ['Start']),
      game && h(ActiveGameComponent, { key: 'game', game, gameMgmt, stateGrain }),
    ])
  )
}
