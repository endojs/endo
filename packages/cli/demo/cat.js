// This is a demo weblet that demonstrates a permission management UI for the
// pet daemon itself.
//
// This command will set up the cat page, create a URL,
// and open it.
//
// > endo install familiar-chat cat.js --powers SELF
//
// Thereafter,
//
// > endo open familiar-chat
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
/* eslint-disable no-continue */

import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

const dateFormatter = new window.Intl.DateTimeFormat(undefined, {
  dateStyle: 'full',
  timeStyle: 'long',
});

const inboxComponent = async ($parent, $end, powers) => {
  const selfId = await E(powers).identify('SELF');
  for await (const message of makeRefIterator(E(powers).followMessages())) {
    const { number, type, from: fromId, to: toId, date, dismissed } = message;

    let verb = '';
    if (type === 'request') {
      verb = 'requested';
    } else if (type === 'package') {
      verb = 'sent';
    } else {
      verb = 'sent an unrecognizable message';
    }
    const $verb = document.createElement('em');
    $verb.innerText = verb;

    const $message = document.createElement('div');

    const $error = document.createElement('span');
    $error.style.color = 'red';
    $error.innerText = '';
    $message.appendChild($error);

    dismissed.then(() => {
      $message.remove();
    });

    const $number = document.createElement('span');
    $number.innerText = `${number}. `;
    $message.appendChild($number);

    if (fromId === selfId && toId === selfId) {
      $message.appendChild(verb);
    } else if (fromId === selfId) {
      const toName = await E(powers).reverseIdentify(toId);
      if (toName === undefined) {
        continue;
      }
      const $to = document.createElement('strong');
      $to.innerText = ` ${toName} `;
      $message.appendChild($verb);
      $message.appendChild($to);
    } else if (toId === selfId) {
      const fromName = await E(powers).reverseIdentify(fromId);
      if (fromName === undefined) {
        continue;
      }
      const $from = document.createElement('strong');
      $from.innerText = ` ${fromName} `;
      $message.appendChild($from);
      $message.appendChild($verb);
    } else {
      const [fromName, toName] = await Promise.all(
        [fromId, toId].map(id => E(powers).reverseIdentify(id)),
      );
      const $from = document.createElement('strong');
      $from.innerText = ` ${fromName} `;
      const $to = document.createElement('strong');
      $to.innerText = ` ${toName} `;
      $message.appendChild($from);
      $message.appendChild($verb);
      $message.appendChild($to);
    }

    if (message.type === 'request') {
      const { description, settled } = message;

      const $description = document.createElement('span');
      $description.innerText = ` ${JSON.stringify(description)} `;
      $message.appendChild($description);

      const $date = document.createElement('i');
      $date.innerText = dateFormatter.format(Date.parse(date));
      $message.appendChild($date);

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

      const $date = document.createElement('i');
      $date.innerText = dateFormatter.format(Date.parse(date));
      $message.appendChild($date);

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

    $parent.insertBefore($message, $end);
  }
};

const inventoryComponent = async ($parent, $end, powers) => {
  const $title = document.createElement('h2');
  $title.innerText = 'Inventory';
  $parent.insertBefore($title, $end);

  const $ul = document.createElement('ul');
  $parent.insertBefore($ul, $end);

  const $names = new Map();
  for await (const change of makeRefIterator(E(powers).followNameChanges())) {
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

const bodyComponent = ($parent, powers) => {
  const $title = document.createElement('h1');
  $title.innerText = '🐈‍⬛';
  $parent.appendChild($title);

  const $endOfMessages = document.createTextNode('');
  $parent.appendChild($endOfMessages);
  inboxComponent($parent, $endOfMessages, powers).catch(window.reportError);

  const $endOfNames = document.createTextNode('');
  $parent.appendChild($endOfNames);
  inventoryComponent($parent, $endOfNames, powers).catch(window.reportError);
};

export const make = async powers => {
  document.body.innerHTML = '';
  bodyComponent(document.body, powers);
};
