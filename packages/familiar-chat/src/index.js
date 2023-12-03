/* global window document globalThis */

import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import 'preact/debug';
import { h, render, Fragment } from 'preact';
import { useState, useEffect } from 'preact/hooks';

/** @type any */
const { assert } = globalThis;

const dateFormatter = new window.Intl.DateTimeFormat(undefined, {
  dateStyle: 'full',
  timeStyle: 'long',
});

const arrayWithout = (array, value) => {
  const newArray = array.slice();
  const index = newArray.indexOf(value);
  if (index !== -1) {
    newArray.splice(index, 1);
  }
  return newArray;
};

const useAsync = (asyncFn, deps) => {
  const [state, setState] = useState();
  useEffect(() => {
    setState(undefined);
    let shouldAbort = false;
    const runAsync = async () => {
      const result = await asyncFn();
      if (!shouldAbort) {
        setState(result);
      }
    };
    runAsync();
    return () => {
      shouldAbort = true;
    };
  }, deps);
  return state;
};

const useFollowReducer = (getSubFn, reducerFn, deps) => {
  const [state, setState] = useState([]);

  useEffect(() => {
    setState([]);
    const sub = makeRefIterator(getSubFn());
    let shouldAbort = false;
    const iterateChanges = async () => {
      for await (const event of sub) {
        // Check if we should abort iteration
        if (shouldAbort) {
          break;
        }
        reducerFn(event, setState);
      }
    };
    // start iteration
    iterateChanges();
    // cleanup
    return () => {
      shouldAbort = true;
    };
  }, deps);

  return state;
};

const useFollowMessages = (getSubFn, deps) => {
  const reducerFn = (message, setState) => {
    // apply change
    setState(prevState => {
      return [...prevState, message];
    });
    // listen for dismiss
    message.dismissed.then(() => {
      setState(prevState => {
        return arrayWithout(prevState, message);
      });
    });
  };

  const state = useFollowReducer(getSubFn, reducerFn, deps);
  return state;
};

const useFollowNames = (getSubFn, deps) => {
  const reducerFn = (change, setState) => {
    // apply change
    setState(prevState => {
      if ('add' in change) {
        const name = change.add;
        return [...prevState, name];
      } else if ('remove' in change) {
        const name = change.remove;
        return arrayWithout(prevState, name);
      }
      return prevState;
    });
  };

  const state = useFollowReducer(getSubFn, reducerFn, deps);
  return state;
};

const packageMessageComponent = ({ message, actions }) => {
  const { when, strings, names } = message;
  assert(Array.isArray(strings));
  assert(Array.isArray(names));

  const [asValue, setAsValue] = useState('');
  const [selectedName, setSelectedName] = useState(names[0]);

  const stringEntries = strings.map((string, index) => {
    const name = names[index];
    if (name === undefined) {
      // Special case for when there are more strings than names.
      const textDisplay = JSON.stringify(string).slice(1, -1);
      return textDisplay;
    } else {
      return h(Fragment, null, [string, h('b', null, `@${name}`)]);
    }
  });

  const hasItems = names.length > 0;

  const makeControls = () => {
    return (
      h(Fragment, null, [
        h(
          'select',
          {
            value: selectedName,
            onchange: e => setSelectedName(e.target.value),
          },
          names.map(name => h('option', { value: name }, name)),
        ),
        ' ',
        h('input', {
          type: 'text',
          placeholder: selectedName,
          value: asValue,
          oninput: e => setAsValue(e.target.value),
        }),
        h(
          // @ts-ignore
          'button',
          {
            onclick: () => actions.adopt(selectedName, asValue || selectedName),
          },
          'Adopt',
        ),
      ])
    )
  }

  return h(Fragment, null, [
    ' "',
    ...stringEntries,
    '" ',
    h('i', null, dateFormatter.format(Date.parse(when))),
    ' ',
    hasItems && makeControls(),
  ]);
};

const requestMessageComponent = ({ message, actions }) => {
  const [petName, setPetName] = useState('');
  const { what, when, settled } = message;
  const status = useAsync(() => settled, [settled]);
  const isUnsettled = status === undefined;
  const statusText = isUnsettled ? '' : ` ${status} `;

  const makeControls = () => {
    return h(Fragment, null, [
      h('input', {
        type: 'text',
        value: petName,
        oninput: e => setPetName(e.target.value),
      }),
      h(
        // @ts-ignore
        'button',
        {
          onclick: () => actions.resolve(petName),
        },
        'resolve',
      ),
      h(
        // @ts-ignore
        'button',
        {
          onclick: () => actions.reject(petName),
        },
        'reject',
      ),
    ]);
  };

  return h(Fragment, null, [
    h('span', null, ` ${what} `),
    h('i', null, dateFormatter.format(Date.parse(when))),
    h('span', null, statusText),
    isUnsettled && makeControls(),
  ]);
};

const messageComponent = ({ message, target }) => {
  const { number, who } = message;
  const [errorText, setErrorText] = useState('');

  let messageBodyComponent;
  if (message.type === 'request') {
    messageBodyComponent = requestMessageComponent;
  } else if (message.type === 'package') {
    messageBodyComponent = packageMessageComponent;
  } else {
    throw new Error(`Unknown message type: ${message.type}`);
  }

  const reportError = error => {
    setErrorText(error.message);
  };
  const actions = {
    dismiss: () => E(target).dismiss(number).catch(reportError),
    resolve: value => E(target).resolve(number, value).catch(reportError),
    reject: value => E(target).reject(number, value).catch(reportError),
    adopt: (selectedName, asValue) =>
      E(target).adopt(number, selectedName, asValue).catch(reportError),
  };

  return h('div', null, [
    h('span', null, `${number}. `),
    h('b', null, `${who}:`),
    h(messageBodyComponent, { message, actions }),
    ' ',
    h(
      // @ts-ignore
      'button',
      {
        onclick: () => actions.dismiss(),
      },
      'Dismiss',
    ),
    h(
      'span',
      {
        style: {
          color: 'red',
        },
      },
      errorText,
    ),
  ]);
};

const followMessagesComponent = ({ target }) => {
  const messages = useFollowMessages(() => E(target).followMessages(), [target]);

  const messageEntries = messages.map(message => {
    return h(messageComponent, { message, target });
  });

  return h(Fragment, null, [
    h('h2', null, 'Messages'),
    h('div', null, messageEntries),
  ]);
};

const followNamesComponent = ({ target }) => {
  const names = useFollowNames(() => E(target).followNames(), [target]);

  const inventoryEntries = names.map(name => {
    return h('li', null, [
      name,
      h(
        // @ts-ignore
        'button',
        {
          onclick: () => E(target).remove(name).catch(window.reportError),
        },
        'Remove',
      ),
    ]);
  });

  return h(Fragment, null, [
    h('h2', null, 'Inventory'),
    h('ul', null, inventoryEntries),
  ]);
};

const pattern = /@([a-z][a-z0-9-]{0,127})(?::([a-z][a-z0-9-]{0,127}))?/g;

export const parseMessage = message => {
  const strings = [];
  const petNames = [];
  const edgeNames = [];
  let start = 0;
  message.replace(pattern, (match, edgeName, petName, stop) => {
    strings.push(message.slice(start, stop));
    start = stop + match.length;

    edgeNames.push(edgeName);
    petNames.push(petName ?? edgeName);
    return '';
  });
  strings.push(message.slice(start));
  return {
    strings,
    petNames,
    edgeNames,
  };
};


const sendComponent = ({ target }) => {
  const [message, setMessage] = useState('');
  const [specifiedRecipientName, setRecipientName] = useState();
  const recipients = useFollowNames(() => E(target).followQueryByType('guest-id512'), []);
  const recipientName = specifiedRecipientName || recipients[0];

  return (
    h(Fragment, null, [
      h('h2', null, 'Send'),
      h(
        'select',
        {
          value: recipientName,
          onchange: e => setRecipientName(e.target.value),
        },
        recipients.map(name => h('option', { value: name }, name)),
      ),
      h(
        'input',
        {
          type: 'text',
          value: message,
          oninput: e => setMessage(e.target.value),
        },
      ),
      h(
        // @ts-ignore
        'button',
        {
          disabled: !recipientName,
          onclick: () => {
            setMessage('');
            const { strings, edgeNames, petNames } = parseMessage(message);
            E(target)
              .send(recipientName, strings, edgeNames, petNames)
              .catch(window.reportError);
          },
        },
        'Send',
      ),
    ])
  )
};

const bodyComponent = ({ powers }) => {
  const [currentInbox, setCurrentInbox] = useState('host');
  const guests = useFollowNames(() => E(powers).followQueryByType('guest-id512'), []);
  const target = useAsync(() => {
    if (currentInbox === 'host') {
      return powers;
    }
    return E(powers).lookup(currentInbox)
  }, [currentInbox]);

  const inboxes = ['host', ...guests]

  return h(Fragment, null, [
    h('h1', {}, '🐈‍⬛'),
    h('span', {}, 'Logged in as:'),
    h(
      'select',
      {
        value: currentInbox,
        onchange: e => setCurrentInbox(e.target.value),
      },
      inboxes.map(inbox => h('option', { value: inbox }, inbox)),
    ),
    target && h(followMessagesComponent, { target }),
    target && h(followNamesComponent, { target }),
    target && h(sendComponent, { target }),
  ]);
};

export const make = async powers => {
  document.body.innerHTML = '';
  const app = h(bodyComponent, { powers });
  render(app, document.body);
};
