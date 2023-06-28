// This is a demo weblet that demonstrates a permission management UI for the
// pet daemon itself.
//
// This command will set up the cat page, create a URL,
// and open it.
//
// > endo open --file cat.js --bundle catBundle --host catPage
//
// Thereafter,
//
// > endo open catPage
//
// To interact with the permission manager, you can mock requests from a fake
// guest.
//
// > endo eval 42 -n ft
// > endo mkguest cat
// > endo request cat 'pet me'
//
// At this point, the command will pause, waiting for a response.
// In the Familiar Chat window, resolve the request with the pet name "ft" and
// the request will exit with the number 42.

/* global window document */

import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

const dateFormatter = new window.Intl.DateTimeFormat(undefined, {
  dateStyle: 'full',
  timeStyle: 'long',
});

const followMessagesComponent = async (parentElement, powers) => {
  for await (const message of makeRefIterator(E(powers).followMessages())) {
    if (message.type === 'request') {
      const { number, what, when, who, settled } = message;

      const $message = document.createElement('div');
      parentElement.appendChild($message);

      const $number = document.createElement('span');
      $number.innerText = `${number}. `;
      $message.appendChild($number);

      const $who = document.createElement('b');
      $who.innerText = `${who}:`;
      $message.appendChild($who);

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
      $resolve.onclick = () => {
        E(powers).resolve(number, $pet.value).catch(window.reportError);
      };
      $input.appendChild($resolve);

      const $reject = document.createElement('button');
      $reject.innerText = 'reject';
      $reject.onclick = () => {
        E(powers).reject(number, $pet.value).catch(window.reportError);
      };
      $input.appendChild($reject);

      settled.then(status => {
        $input.innerText = ` ${status} `;
      });
    }
  }
};

export const endow = async powers => {
  document.body.innerHTML =
    '<h1>🐈‍⬛ Familiar Chat</h1><h2>Or: <i>Le Chat Familier</i></h2>';
  followMessagesComponent(document.body, powers).catch(window.reportError);
};
