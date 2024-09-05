/* global window document globalThis */

import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
// import 'preact/debug';
// import { h, render, Fragment } from 'preact';
// import { useState, useEffect } from 'preact/hooks';

import React from 'react';
import { createRoot } from 'react-dom/client';
// bundler compat issue?
const { Fragment, useEffect, useState } = React;

// preact/react compatibility
const h = React.createElement;
const render = (vnode, domNode) => {
  const root = createRoot(domNode)
  root.render(vnode);
}

/** @type any */
const { assert } = globalThis;

const inventoryTypeDisplayDict = {
  'web-bundle': 'app',
  'guest-id512': 'guest',
  'readable-blob-sha512': 'file',
  'import-bundle-id512': 'object',
  'import-unsafe-id512': 'unsafe object',
}

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

/**
 * @param {()=>Promise} asyncFn
 * @param {Array} deps
 * @returns {any | undefined}
 */
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
    const sub = getSubFn();
    if (!sub) return
    const subIterator = makeRefIterator(sub);
    let shouldAbort = false;
    const iterateChanges = async () => {
      for await (const event of subIterator) {
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

const useFollowChanges = (getSubFn, deps) => {
  const reducerFn = (change, setState) => {
    // apply change
    setState(prevState => {
      if ('add' in change) {
        const name = change.add;
        const value = change.value;
        return [...prevState, { name, value }];
      } else if ('remove' in change) {
        const name = change.remove;
        const match = prevState.find(({ name: n }) => n === name);
        return arrayWithout(prevState, match);
      }
      return prevState;
    });
  };

  const state = useFollowReducer(getSubFn, reducerFn, deps);
  return state;
};

/**
 * @param {Date} date
 */
const formatChatTime = (date) => {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';

  hours %= 12;
  hours = hours || 12; // the hour '0' should be '12'
  const minutesStr = minutes < 10 ? `0${  minutes}` : minutes;

  const strTime = `${hours}:${minutesStr} ${ampm}`
  return strTime;
}

const packageMessageEdgeNameComponent = ({ edgeName, formulaId, setSelectedName, nameIdPairs }) => {
  const matchingPair = nameIdPairs.find(({ id }) => formulaId === id);
  const nameIsKnown = matchingPair !== undefined;
  const nameDisplay = nameIsKnown ? `@${matchingPair.name}` : `?${edgeName}`;

  return (
    h('b', {
      onClick: () => setSelectedName(edgeName),
      style: {
        cursor: 'pointer',
      },
    }, nameDisplay)
  )
};

const packageMessageDisplayComponent = ({ message, setSelectedName, nameIdPairs }) => {
  /** @type {{ strings: string[], names: string[], formulaIds: string[] }} */
  const { strings, names, formulaIds } = message;
  const stringEntries = strings.map((string, index) => {
    const name = names[index];
    if (name === undefined) {
      // Special case for when there are more strings than names.
      const textDisplay = JSON.stringify(string).slice(1, -1);
      return textDisplay;
    } else {
      const formulaId = formulaIds[index];
      return h(Fragment, null, [
        string,
        h(packageMessageEdgeNameComponent, { edgeName: name, formulaId, setSelectedName, nameIdPairs }),
      ]);
    }
  });
  return h(Fragment, null, [
    ...stringEntries,
  ]);
};

const packageMessageBodyComponent = ({ message, actions, showControls, nameIdPairs }) => {
  /** @type {{ strings: string[], names: string[], formulaTypes: string[] }} */
  const { strings, names, formulaTypes } = message;
  assert(Array.isArray(strings));
  assert(Array.isArray(names));

  const [asValue, setAsValue] = useState('');
  const [selectedName, setSelectedName] = useState(names[0]);
  const hasItems = names.length > 0;

  const makeControls = () => {
    const index = names.indexOf(selectedName);
    const type = formulaTypes[index];
    const isApp = type === 'web-bundle';
    const typeDisplay = inventoryTypeDisplayDict[type] ?? type;

    return (
      h(Fragment, null, [
        h(
          'select',
          {
            value: selectedName,
            onChange: e => setSelectedName(e.target.value),
          },
          names.map(name => h('option', { value: name }, name)),
        ),
        ` (${typeDisplay}) `,
        h('input', {
          type: 'text',
          placeholder: selectedName,
          value: asValue,
          onChange: e => setAsValue(e.target.value),
        }),
        !isApp && h(
          // @ts-ignore
          'button',
          {
            onClick: () => {
              actions.adopt(selectedName, asValue || selectedName)
            },
          },
          'Adopt',
        ),
        isApp && h(
          // @ts-ignore
          'button',
          {
            onClick: () => {
              actions.adoptApp(selectedName, asValue || selectedName)
            },
          },
          'Install App',
        ),
      ])
    )
  }

  return h(Fragment, null, [
    ' ',
    h(packageMessageDisplayComponent, { message, setSelectedName, nameIdPairs }),
    showControls && h('br', null),
    showControls && hasItems && makeControls(),
  ]);
};

const requestMessageBodyComponent = ({ message, actions, showControls }) => {
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
        onChange: e => setPetName(e.target.value),
      }),
      h(
        // @ts-ignore
        'button',
        {
          onClick: () => actions.resolve(petName),
        },
        'resolve',
      ),
      h(
        // @ts-ignore
        'button',
        {
          onClick: () => actions.reject(petName),
        },
        'reject',
      ),
    ]);
  };

  return h(Fragment, null, [
    h('span', null, ` ${what} `),
    h('i', null, dateFormatter.format(Date.parse(when))),
    h('span', null, statusText),
    showControls && isUnsettled && makeControls(),
  ]);
};

const messageComponent = ({ message, target, targetName, setActiveMessage, showControls, inventory }) => {
  const { number, who, when } = message;
  const [errorText, setErrorText] = useState('');

  let messageBodyComponent;
  if (message.type === 'request') {
    messageBodyComponent = requestMessageBodyComponent;
  } else if (message.type === 'package') {
    messageBodyComponent = packageMessageBodyComponent;
  } else {
    throw new Error(`Unknown message type: ${message.type}`);
  }

  const whoText = who === 'SELF' ? `${targetName}` : `${who}`;

  const reportError = error => {
    setErrorText(error.message);
  };
  const actions = {
    dismiss: () => E(target).dismiss(number).catch(reportError),
    resolve: value => E(target).resolve(number, value).catch(reportError),
    reject: value => E(target).reject(number, value).catch(reportError),
    adopt: (selectedName, asValue) =>
      E(target).adopt(number, selectedName, asValue).catch(reportError),
    adoptApp: (selectedName, asValue) =>
      E(target).adoptApp(number, selectedName, asValue).catch(reportError),
  };

  return h('div', {
    onClick: () => setActiveMessage(message),
  }, [
    h('span', null, [
      formatChatTime(new Date(when)),
    ]),
    ' ',
    h('b', null, `${whoText}:`),
    h(messageBodyComponent, { message, actions, showControls, nameIdPairs: inventory }),
    ' ',
    showControls && h(
      // @ts-ignore
      'button',
      {
        onClick: () => actions.dismiss(),
      },
      'Hide',
    ),
    showControls && h(
      'span',
      {
        style: {
          color: 'red',
        },
      },
      ` ${errorText}`,
    ),
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

const sendComponent = ({ target, recipientName }) => {
  const [message, setMessage] = useState('');

  const submitMessage = () => {
    setMessage('');
    const { strings, edgeNames, petNames } = parseMessage(message);
    E(target)
      .send(recipientName, strings, edgeNames, petNames)
      .catch(window.reportError);
  }

  return (
    h(Fragment, null, [
      h(
        'input',
        {
          type: 'text',
          value: message,
          onChange: e => setMessage(e.target.value),
          onKeyDown: e => {
            if (e.key === 'Enter') {
              submitMessage()
            }
          },
        },
      ),
      h(
        // @ts-ignore
        'button',
        {
          disabled: !recipientName,
          onClick: () => {
            submitMessage()
          },
        },
        'Send',
      ),
    ])
  )
};

const chatComponent = ({ target, targetName, chatPartners, inventory }) => {
  const [activeMessage, setActiveMessage] = useState(false);
  const messages = useFollowMessages(() => E(target).followMessages(), [target]);
  const knownGuests = chatPartners.map(({ name }) => name);
  const isHost = targetName === 'host';
  const recipients = isHost ? knownGuests : ['HOST', ...knownGuests];
  const [specifiedRecipientName, setRecipientName] = useState();
  const recipientName = specifiedRecipientName || recipients[0];
  const currentMessages = messages.filter(message => {
    const { who, dest } = message;
    return who === recipientName || dest === recipientName;
  })

  const messageEntries = currentMessages.map(message => {
    const showControls = activeMessage === message;
    return h(messageComponent, { message, target, targetName, setActiveMessage, showControls, inventory });
  });

  return h(Fragment, null, [
    h('h2', null, 'Chat'),
    h('span', null, ['Chatting with:']),
    h(
      'select',
      {
        value: recipientName,
        onChange: e => setRecipientName(e.target.value),
      },
      recipients.map(name => h('option', { value: name }, name)),
    ),
    h('div', null, messageEntries),
    h(sendComponent, { target, recipientName }),
  ]);
};

const inventoryEntryComponent = ({ target, item }) => {
  const { name, type } = item;
  const isWebBundle = type === 'web-bundle';
  const itemValue = useAsync(() => isWebBundle && E(target).lookup(name), [target, name, isWebBundle])
  const typeDisplay = inventoryTypeDisplayDict[type] ?? type;
  return h('li', null, [
    `${name} `,
    h('i', null, `(${typeDisplay})`),
    ' ',
    h(
      // @ts-ignore
      'button',
      {
        onClick: () => E(target).remove(name).catch(window.reportError),
      },
      'Remove',
    ),
    isWebBundle && itemValue && h(
      // @ts-ignore
      'button',
      {
        onClick: () => {
          window.open(itemValue.url, '_blank')
        },
      },
      'Open App',
    ),
  ]);
}

const inventoryComponent = ({ target, inventory }) => {
  const inventoryMap = new Map()
  for (const item of inventory) {
    inventoryMap.set(item.name, item);
  }
  const sortedNames = [...inventoryMap.keys()].sort((a, b) => a.localeCompare(b));

  const inventoryEntries = sortedNames.map(name => {
    return h(inventoryEntryComponent, { target, item: inventoryMap.get(name) });
  });

  return h(Fragment, null, [
    h('h2', null, 'Inventory'),
    h('ul', null, inventoryEntries),
  ]);
};

const bodyComponent = ({ powers }) => {
  const [currentInbox, setCurrentInbox] = useState('host');
  const target = useAsync(() => {
    if (currentInbox === 'host') {
      return powers;
    }
    return E(powers).lookup(currentInbox)
  }, [currentInbox]);
  const inventory = useFollowChanges(() => target && E(target).followNameChangesWithType(), [target]);
  const nameTypePairs = inventory.map(({ name, value: { type }}) => ({ name, type }));
  const handles = nameTypePairs.filter(({ type }) => type === 'handle');
  const guests = []
  const inboxes = ['host', ...guests]

  return h(Fragment, null, [
    h('h1', {}, '🐈‍⬛'),
    h('span', {}, 'Logged in as: '),
    h(
      'select',
      {
        value: currentInbox,
        onChange: e => setCurrentInbox(e.target.value),
      },
      inboxes.map(inbox => h('option', { value: inbox }, inbox)),
    ),
    target && h(inventoryComponent, { target, inventory: nameTypePairs }),
    target && h(chatComponent, { target, targetName: currentInbox, chatPartners: handles, inventory }),
  ]);
};

export const make = async powers => {
  document.body.innerHTML = '';
  const app = h(bodyComponent, { powers });
  render(app, document.body);
};
