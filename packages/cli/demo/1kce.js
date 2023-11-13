// This is a demo weblet that demonstrates a permission management UI for the
// pet daemon itself.
//
// This command will set up the cat page, create a URL,
// and open it.
//
// > endo open familiar-chat cat.js --powers HOST
//
// Thereafter,
//
// > endo open fami ar-chat
//
// To interact with the permission manager, you can mock requests from a fake
// guest.
//
// > endo eval 42 --name ft
// > endo request --as cat 'pet me'
//
// At this point, the command will pause, waiting for a response.
// In the Familiar Chat window, resolve the request with the pet name "ft" and
// the request will exit with the number 42.

/* global window document */

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

const makeThing = async (powers, importFullPath, resultName) => {
  const workerName = 'MAIN';
  const powersName = 'NONE';
  const deck = await E(powers).importUnsafeAndEndow(
    workerName,
    // path.resolve(importPath),
    importFullPath,
    powersName,
    resultName,
  );
  return deck
}

const makeDeck = async (powers) => {
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

const dateFormatter = new window.Intl.DateTimeFormat(undefined, {
  dateStyle: 'full',
  timeStyle: 'long',
});

const followCardsComponent = async ($parent, powers, deck, cancelled) => {
  const $subtitle = document.createElement('h2');
  $subtitle.innerText = 'cards in deck'
  $parent.appendChild($subtitle);
  
  const $cards = document.createElement('ul');
  $parent.appendChild($cards);
  const $endOfCards = document.createTextNode('');
  $parent.appendChild($endOfCards);

  if (deck === undefined) {
    // show no deck message
    const $emptyDeck = document.createElement('li');
    $emptyDeck.innerText = 'No deck found.';
    $cards.appendChild($emptyDeck);
  }

  let isCancelled = false
  cancelled.then(() => {
    isCancelled = true
  })

  for await (const card of await E(deck).getCards()) {
  // for await (const card of makeRefIterator(E(deck).getCards())) {
    if (isCancelled) {
      return
    }
    const $card = document.createElement('li');
    const nickname = await E(powers).reverseLookup(card)
    $card.innerText = nickname;
    $cards.appendChild($card);
  }
};

// const cardCreatorComponent = async ($parent, powers, deck) => {

//   // add card name
//   const $cardName = document.createElement('input');
//   $cardName.placeholder = 'Enter card name here';
//   $parent.appendChild($cardName);

//   // card content text area
//   const $cardContent = document.createElement('textarea');
//   $cardContent.value = `import { Far } from '@endo/far';
// Far('Card', {
//   play (game) {
    
//   }
// });
// `;

//   $parent.appendChild($cardContent);
  
//   // add card button
//   const $addCard = document.createElement('button');
//   $addCard.innerText = 'Add Card';
//   $parent.appendChild($addCard);

//   $addCard.onclick = async () => {
//     const workerName = 'MAIN'
//     const source = $cardContent.value
//     const codeNames = []
//     const petNames = []
//     const resultName = $cardName.value
//     const card = await E(powers).evaluate(
//       workerName,
//       source,
//       codeNames,
//       petNames,
//       resultName,
//     )
//     await E(deck).add(card);
//     drawDeckCards()
//   };
// }

const cardAdderComponent = async ($parent, powers, addCardByName) => {

  // add card name
  const $cardName = document.createElement('input');
  $cardName.placeholder = 'Enter card name here';
  $parent.appendChild($cardName);
  
  // add card button
  const $addCard = document.createElement('button');
  $addCard.innerText = 'Add Card';
  $parent.appendChild($addCard);

  $addCard.onclick = async () => {
    addCardByName($cardName.value)
  };

}

const deckManagerComponent = async ($parent, powers) => {
  let deck
  // workaround for https://github.com/endojs/endo/issues/1843
  if (await E(powers).has('deck')) {
    deck = await E(powers).lookup('deck')
    console.log('deck', deck)
  }

  let drawCardsProcess
  let $cardsContainer
  const drawDeckCards = () => {
    if (drawCardsProcess) {
      drawCardsProcess()
    }
    const { resolve, promise: cancelled } = makePromiseKit()
    drawCardsProcess = resolve
    if ($cardsContainer) {
      $cardsContainer.remove()
    }
    $cardsContainer = document.createElement('div');
    $parent.appendChild($cardsContainer);
    followCardsComponent($cardsContainer, powers, deck, cancelled);
  }

  // make deck button
  const $makeDeck = document.createElement('button');
  $makeDeck.innerText = 'Make Deck';
  $parent.appendChild($makeDeck);
  $makeDeck.onclick = async () => {
    deck = await makeDeck(powers)
    console.log('deck', deck);
    drawDeckCards()
  };

  // list cards
  drawDeckCards()

  const addCardByName = async (cardName) => {
    const card = await E(powers).lookup(
      cardName,
    )
    await E(deck).add(card);
    drawDeckCards()
  }

  cardAdderComponent($parent, powers, addCardByName)

  return {
    addCardByName,
    getDeck: () => deck,
  }
};

const followMessagesComponent = async ($parent, $end, powers) => {
  for await (const message of makeRefIterator(E(powers).followMessages())) {
    const { number, who, when, dismissed } = message;

    const $error = document.createElement('span');
    $error.style.color = 'red';
    $error.innerText = '';  

    const $message = document.createElement('div');
    $parent.insertBefore($message, $end);

    dismissed.then(() => {
      $message.remove();
    });

    const $number = document.createElement('span');
    $number.innerText = `${number}. `;
    $message.appendChild($number);

    const $who = document.createElement('b');
    $who.innerText = `${who}:`;
    $message.appendChild($who);

    if (message.type === 'request') {
      const { what, settled } = message;

      const $what = document.createElement('span');
      $what.innerText = ` ${what} `;
      $message.appendChild($what);

      const $when = document.createElement('i');
      $when.innerText = dateFormatter.format(Date.parse(when));
      $message.appendChild($when);

      const $input = document.createElement('span');
      $message.appendChild($input);

      const $pet = document.createElement('input');
      $input.appendChild($pet);

      const $resolve = document.createElement('button');
      $resolve.innerText = 'resolve';
      $input.appendChild($resolve);

      const $reject = document.createElement('button');
      $reject.innerText = 'reject';
      $reject.onclick = () => {
        E(powers).reject(number, $pet.value).catch(window.reportError);
      };
      $input.appendChild($reject);

      $resolve.onclick = () => {
        E(powers)
          .resolve(number, $pet.value)
          .catch(error => {
            $error.innerText = ` ${error.message}`;
          });
      };

      settled.then(status => {
        $input.innerText = ` ${status} `;
      });
    } else if (message.type === 'package') {
      const { strings, names } = message;
      assert(Array.isArray(strings));
      assert(Array.isArray(names));

      $message.appendChild(document.createTextNode(' "'));

      let index = 0;
      for (
        index = 0;
        index < Math.min(strings.length, names.length);
        index += 1
      ) {
        assert.typeof(strings[index], 'string');
        const outer = JSON.stringify(strings[index]);
        const inner = outer.slice(1, outer.length - 1);
        $message.appendChild(document.createTextNode(inner));
        assert.typeof(names[index], 'string');
        const name = `@${names[index]}`;
        const $name = document.createElement('b');
        $name.innerText = name;
        $message.appendChild($name);
      }
      if (strings.length > names.length) {
        const outer = JSON.stringify(strings[index]);
        const inner = outer.slice(1, outer.length - 1);
        $message.appendChild(document.createTextNode(inner));
      }

      $message.appendChild(document.createTextNode('" '));

      const $when = document.createElement('i');
      $when.innerText = dateFormatter.format(Date.parse(when));
      $message.appendChild($when);

      $message.appendChild(document.createTextNode(' '));

      if (names.length > 0) {
        const $names = document.createElement('select');
        $message.appendChild($names);
        for (const name of names) {
          const $name = document.createElement('option');
          $name.innerText = name;
          $names.appendChild($name);
        }

        $message.appendChild(document.createTextNode(' '));

        const $as = document.createElement('input');
        $as.type = 'text';
        $message.appendChild($as);

        $message.appendChild(document.createTextNode(' '));

        const $adopt = document.createElement('button');
        $adopt.innerText = 'Adopt';
        $message.appendChild($adopt);
        $adopt.onclick = () => {
          console.log($as.value, $as);
          E(powers)
            .adopt(number, $names.value, $as.value || $names.value)
            .then(
              () => {
                $as.value = '';
              },
              error => {
                $error.innerText = ` ${error.message}`;
              },
            );
        };
      }
    }

    $message.appendChild(document.createTextNode(' '));

    const $dismiss = document.createElement('button');
    $dismiss.innerText = 'Dismiss';
    $message.appendChild($dismiss);
    $dismiss.onclick = () => {
      E(powers)
        .dismiss(number)
        .catch(error => {
          $error.innerText = ` ${error.message}`;
        });
    };

    $message.appendChild($error);
  }
};

const playGameComponent = ($parent, powers, getDeck) => {
  const $title = document.createElement('h2');
  $title.innerText = 'Play';
  $parent.appendChild($title);

  const $button = document.createElement('button');
  $button.innerText = 'Start';
  $parent.appendChild($button);
  $button.onclick = async () => {
    const deck = getDeck()
    // make game
    const game = await makeGame(powers)
    console.log('start', deck, game)
    await E(game).start(deck)
  }
}

const followNamesComponent = async ($parent, $end, powers, addToDeck) => {
  const $title = document.createElement('h2');
  $title.innerText = 'Inventory';
  $parent.insertBefore($title, $end);

  const $ul = document.createElement('ul');
  $parent.insertBefore($ul, $end);

  const $names = new Map();
  for await (const change of makeRefIterator(E(powers).followNames())) {
    if ('add' in change) {
      const name = change.add;

      const $li = document.createElement('li');
      $ul.appendChild($li);

      const $name = document.createTextNode(`${name} `);
      $li.appendChild($name);
      $name.innerText = change.add;

      const $remove = document.createElement('button');
      $li.appendChild($remove);
      $remove.innerText = 'Remove';
      $remove.onclick = () => E(powers).remove(name).catch(window.reportError);

      const $addToDeck = document.createElement('button');
      $li.appendChild($addToDeck);
      $addToDeck.innerText = 'Add to Deck';
      $addToDeck.onclick = () => addToDeck(name);

      $names.set(name, $li);
    } else if ('remove' in change) {
      const $li = $names.get(change.remove);
      if ($li !== undefined) {
        $li.remove();
        $names.delete(change.remove);
      }
    }
  }
};

const bodyComponent = async ($parent, powers) => {
  const $title = document.createElement('h1');
  $title.innerText = '🃏';
  $parent.appendChild($title);

  const { addCardByName, getDeck } = await deckManagerComponent($parent, powers);

  const $endOfMessages = document.createTextNode('');
  $parent.appendChild($endOfMessages);
  followMessagesComponent($parent, $endOfMessages, powers).catch(
    window.reportError,
  );

  const $endOfNames = document.createTextNode('');
  $parent.appendChild($endOfNames);
  followNamesComponent($parent, $endOfNames, powers, addCardByName).catch(window.reportError);

  playGameComponent($parent, powers, getDeck)
};

export const make = async powers => {
  document.body.innerHTML = '';
  bodyComponent(document.body, powers);
};
