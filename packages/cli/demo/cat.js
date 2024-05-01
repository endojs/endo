// This is a demo weblet that demonstrates a permission management UI for the
// pet daemon itself.
//
// This command will set up the cat page, create a URL,
// and open it.
//
// > endo install cat.js --powers AGENT --listen 8920 --name cat
//
// Thereafter,
//
// > endo open cat
//
// To interact with the permission manager, you can mock requests from a fake
// guest.
//
// > endo eval 42 --name ft
// > endo mkguest feline
// > endo request --as feline 'pet me'
//
// At this point, the command will pause, waiting for a response.
// In the Familiar Chat window, resolve the request with the pet name "ft" and
// the request will exit with the number 42.

/* global window document requestAnimationFrame */
/* eslint-disable no-continue */

import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { parseMessage } from '../src/message-parse.js';

const template = `
<style>

  * {
    box-sizing: border-box;
    font-family: Bahnschrift, 'DIN Alternate', 'Franklin Gothic Medium', 'Nimbus Sans Narrow', sans-serif-condensed, sans-serif;
    font-weight: normal;
  }

  body {
    height: 100vh;
    overflow: hidden;
    margin: 0;
    padding: 0;
    font-size: 200%;
  }

  #messages {
    height: calc(100vh + 1px);
    width: 70vw;
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    right: 70vw;
    padding-top: 100vh;
    padding-left: 20px;
    padding-right: 20px;
    padding-bottom: 20px;
    margin: 0px;
    overflow-y: auto;
    overflow-x: hidden;
  }

  #anchor {
    height: 20px;
  }

  #pets {
    height: 100vh;
    width: 30vw;
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 70vw;
    padding: 20px;
    overflow-y: auto;
    overflow-x: hidden;
    background-color: hsl(210, 71%, 72%);
    border-left: 1px solid hsl(210, 60%, 52%);
  }

  #pet-list {
    display: flex;
    flex-direction: column;
    flex-wrap: wrap-reverse;
  }

  #pet-item {
    whitespace: no-wrap;
  }

  #controls {
    position: absolute;
    right: 0;
    bottom: 0;
    padding: 20px;
    display: flex;
    flex-direction: row-reverse;
    flex-wrap: wrap-reverse;
  }

  #controls > button {
    font-size: 50px;
    border-width: 5px;
    border-radius: 10px;
    margin: 5px;
  }

  #controls button:not([id=cat]) {
    display: none;
  }

  #controls[data-show=true] button {
    display: inline;
  }

  #chat-frame {
    display: none;
  }

  #chat-frame[data-show=true] {
    display: flex;
  }

  #chat-message {
    width: 40ex;
    font-size: 150%;
  }

  .frame {
    position: absolute;
    height: 100vh;
    width: 100vw;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: hsla(210, 38%, 29%, 0.5)
  }

  .window {
    background-color: white;
    padding: 20px;
    border: 1px solid hsl(210, 60%, 52%);
    border-radius: 10px;
    overflow: hidden;
    align-self: center;
    flex: none;
  }

  .error {
    color: red;
    word-break: break-word;
    max-width: 40ex;
  }

  .adoption {
    white-space: nowrap;
  }

</style>

<div id="messages">
  <div id="anchor"></div>
</div>

<div id="pets">
</div>

<div id="controls">
  <button id="cat">🐈‍⬛</button>
  <button id="chat-button">Chat</button>
</div>

<div id="chat-frame" class="frame">
  <div id="chat-window" class="window">
    <label for="chat-to">To:&nbsp;<select id="chat-to"></select></label>
    <p><input type="text" id="chat-message">
    <p id="endowments">
    <p id="chat-error" class="error">
    <p><button id="chat-discard-button">Discard</button>
    <button id="chat-send-button">Send</button>
  </div>
</div>
`;

const dateFormatter = new window.Intl.DateTimeFormat(undefined, {
  dateStyle: 'full',
  timeStyle: 'long',
});

const inboxComponent = async ($parent, $end, powers) => {
  $parent.scrollTo(0, $parent.scrollHeight);

  const selfId = await E(powers).identify('SELF');
  for await (const message of makeRefIterator(E(powers).followMessages())) {
    // Read DOM at animation frame to determine whether to pin scroll to bottom
    // of the messages pane.
    const wasAtEnd = await new Promise(resolve =>
      requestAnimationFrame(() => {
        const scrollTop = /** @type {number} */ ($parent.scrollTop);
        const endScrollTop = /** @type {number} */ (
          $parent.scrollHeight - $parent.clientHeight
        );
        resolve(scrollTop > endScrollTop - 10);
      }),
    );

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
    $message.className = 'message';

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
      $message.appendChild($verb);
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

      $pet.addEventListener('keyup', event => {
        // (do not bubble to the accelerator)
        event.stopPropagation();
      });

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
        const $adoption = document.createElement('span');
        $adoption.className = 'adoption';
        $message.appendChild($adoption);

        const $names = document.createElement('select');
        $adoption.appendChild($names);
        for (const name of names) {
          const $name = document.createElement('option');
          $name.value = name;
          $name.innerText = name;
          $names.appendChild($name);
        }

        $adoption.appendChild(document.createTextNode(' '));

        const $as = document.createElement('input');
        $as.type = 'text';
        $adoption.appendChild($as);

        const handleAdopt = () => {
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

        $as.addEventListener('keyup', event => {
          const { key, repeat, metaKey } = event;
          if (repeat || metaKey) return;
          if (key === 'Enter') {
            handleAdopt();
          }
          // (do not bubble to accelerator)
          event.stopPropagation();
        });

        $adoption.appendChild(document.createTextNode(' '));

        const $adopt = document.createElement('button');
        $adopt.innerText = 'Adopt';
        $adoption.appendChild($adopt);
        $adopt.onclick = handleAdopt;
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

    if (wasAtEnd) {
      $parent.scrollTo(0, $parent.scrollHeight);
    }
  }
};

const inventoryComponent = async ($parent, $end, powers) => {
  const $list = document.createElement('div');
  $list.className = 'pet-list';
  $parent.insertBefore($list, $end);

  const $names = new Map();
  for await (const change of makeRefIterator(E(powers).followNameChanges())) {
    if ('add' in change) {
      const name = change.add;

      const $item = document.createElement('div');
      $item.className = 'pet-item';
      $list.appendChild($item);

      const $name = document.createTextNode(`${name} `);
      $item.appendChild($name);
      $name.innerText = change.add;

      const $remove = document.createElement('button');
      $item.appendChild($remove);
      $remove.innerText = 'Remove';
      $remove.onclick = () => E(powers).remove(name).catch(window.reportError);

      $names.set(name, $item);
    } else if ('remove' in change) {
      const $item = $names.get(change.remove);
      if ($item !== undefined) {
        $item.remove();
        $names.delete(change.remove);
      }
    }
  }
};

const inventorySelectComponent = async ($select, powers) => {
  $select.innerHTML = '';

  const $names = new Map();
  for await (const change of makeRefIterator(E(powers).followNameChanges())) {
    if ('add' in change) {
      const name = change.add;

      const $option = document.createElement('option');
      $select.appendChild($option);

      const $name = document.createTextNode(`${name}`);
      $option.appendChild($name);
      $name.innerText = change.add;

      $names.set(name, $option);
    } else if ('remove' in change) {
      const $option = $names.get(change.remove);
      if ($option !== undefined) {
        $option.remove();
        $names.delete(change.remove);
      }
    }
  }
};

const controlsComponent = ($parent, { focusChat, blurChat }) => {
  const $chatFrame = $parent.querySelector('#chat-frame');
  const $controls = $parent.querySelector('#controls');
  const $cat = $parent.querySelector('#cat');

  let showFanout = false;

  const showChat = () => {
    $chatFrame.dataset.show = 'true';
    $controls.dataset.show = 'false';
    showFanout = false;
    focusChat();
  };

  const dismissChat = () => {
    $chatFrame.dataset.show = 'false';
    blurChat();
  };

  $cat.addEventListener('click', () => {
    showFanout = !showFanout;
    $controls.dataset.show = `${showFanout}`;
  });

  const $chatButton = $parent.querySelector('#chat-button');
  $chatButton.addEventListener('click', () => {
    showChat();
  });

  window.addEventListener('keyup', event => {
    const { key, repeat, metaKey } = event;
    if (repeat || metaKey) return;
    if (key === '"' || key === "'") {
      showChat();
      event.stopPropagation();
    }
  });

  return { dismissChat };
};

const chatComponent = ($parent, powers, { dismissChat }) => {
  const $chatFrame = $parent.querySelector('#chat-frame');
  const $chatSendButton = $parent.querySelector('#chat-send-button');
  const $chatRecipientSelect = $parent.querySelector('#chat-to');
  const $chatMessageInput = $parent.querySelector('#chat-message');
  const $chatDiscardButton = $parent.querySelector('#chat-discard-button');
  const $chatError = $parent.querySelector('#chat-error');

  $chatDiscardButton.addEventListener('click', () => {
    dismissChat();
  });

  const handleChat = event => {
    event.preventDefault();
    event.stopPropagation();
    const to = $chatRecipientSelect.value;
    const { strings, petNames, edgeNames } = parseMessage(
      $chatMessageInput.value,
    );
    E(powers)
      .send(to, strings, edgeNames, petNames)
      .then(dismissChat, error => {
        $chatError.innerText = error.message;
      });
  };

  $chatFrame.addEventListener('keyup', event => {
    const { key, repeat, metaKey } = event;
    if (repeat || metaKey) return;
    if (key === 'Enter') {
      handleChat(event);
    }
    if (key === 'Escape') {
      dismissChat();
      event.stopPropagation();
    }
  });

  $chatSendButton.addEventListener('click', handleChat);

  const focusChat = () => {
    $chatRecipientSelect.focus();
  };

  const blurChat = () => {
    $chatMessageInput.value = '';
    $chatError.innerText = '';
  };

  inventorySelectComponent($chatRecipientSelect, powers).catch(
    window.reportError,
  );

  return { focusChat, blurChat };
};

const bodyComponent = ($parent, powers) => {
  $parent.innerHTML = template;

  const $messages = $parent.querySelector('#messages');
  const $anchor = $parent.querySelector('#anchor');
  const $pets = $parent.querySelector('#pets');

  inboxComponent($messages, $anchor, powers).catch(window.reportError);
  inventoryComponent($pets, null, powers).catch(window.reportError);

  // To they who can avoid forward-references for entangled component
  // dependency-injection, I salute you and welcome your pull requests.
  /* eslint-disable no-use-before-define */
  const { dismissChat } = controlsComponent($parent, {
    focusChat: () => focusChat(),
    blurChat: () => blurChat(),
  });
  const { focusChat, blurChat } = chatComponent($parent, powers, {
    dismissChat,
  });
  /* eslint-enable no-use-before-define */
};

export const make = async powers => {
  document.body.innerHTML = '';
  bodyComponent(document.body, powers);
};
