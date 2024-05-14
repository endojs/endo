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

// not exported by daemon?
const formatId = ({ number, node }) => {
  const id = `${number}:${node}`;
  // assertValidId(id);
  return id;
};

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
        console.log('useFollowReducer event', event, shouldAbort)
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

const chatMessagePattern = /@([a-z][a-z0-9-]{0,127})(?::([a-z][a-z0-9-]{0,127}))?/g;

const parseChatMessage = message => {
  const strings = [];
  const petNames = [];
  const edgeNames = [];
  let start = 0;
  message.replace(chatMessagePattern, (match, edgeName, petName, stop) => {
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

const PackageMessageEdgeNameComponent = ({ edgeName, formulaId, setSelectedName, nameIdPairs }) => {
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

const PackageMessageDisplayComponent = ({ message, setSelectedName, nameIdPairs }) => {
  /** @type {{ strings: string[], names: string[], ids: string[] }} */
  const { strings, names, ids } = message;
  const stringEntries = strings.map((string, index) => {
    const name = names[index];
    if (name === undefined) {
      // Special case for when there are more strings than names.
      const textDisplay = JSON.stringify(string).slice(1, -1);
      return textDisplay;
    } else {
      const formulaId = ids[index];
      return h(Fragment, null, [
        string,
        h(PackageMessageEdgeNameComponent, { edgeName: name, formulaId, setSelectedName, nameIdPairs }),
      ]);
    }
  });
  return h(Fragment, null, [
    ...stringEntries,
  ]);
};

const PackageMessageBodyComponent = ({ message, actions, showControls, nameIdPairs }) => {
    // date: "2024-05-13T03:39:58.577Z"
    // dismissed: Promise {<pending>}
    // dismisser: Alleged: Dismisser {}
    // from: "59f3acfc3eebdd6fd27a46db2670716440e85225f2607d931042f4f2ad499693bc464f5787dcda1fab1811e1b07ebfba47c945225d8d118024ddb0998cb08102:969bc6bb05575f8ede7167013b40ae054fc5fa48f9609541c3fbf86d09482ccf0f16c0fc5184a9d27192772d344445e5710c7c9fc4ff96afd282cf519cbe3a3e"
    // ids: []
    // names: []
    // number: 5
    // strings: ['y']
    // to: "de216c6283f791a0fe7cac27b8b9e398cfa73468f508666eff2f2e3ea53ce570b15d1b88e9352b03aacd5e9322fe162ffd2ea04f54cf291eca9e8e2b1f7585db:9c11c6f325eff13d8c678c90a62f5bc76bd3b4d7355d7190528d48a0ee6905ee5a53ebe341a2ac001c27b5f313ec4ca2a4631f0fd66b4cd1d2adc0d4a774dc70"
    // type: "package"
  /** @type {{ strings: string[], names: string[], ids: string[] }} */
  const { strings, names, ids } = message;
  assert(Array.isArray(strings));
  assert(Array.isArray(names));

  const [asValue, setAsValue] = useState('');
  const [selectedName, setSelectedName] = useState(names[0]);
  const selectedId = ids[names.indexOf(selectedName)];
  const hasItems = names.length > 0;

  const makeControls = () => {
    // const index = names.indexOf(selectedName);
    // const type = formulaTypes[index];
    let type = 'unknown';
    if (selectedName.startsWith('bundle-')) {
      type = 'web-bundle';
    }
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
              actions.adoptApp(selectedName, asValue || selectedName, 'AGENT')
            },
          },
          'Install App',
        ),
      ])
    )
  }

  return h(Fragment, null, [
    ' ',
    h(PackageMessageDisplayComponent, { message, setSelectedName, nameIdPairs }),
    showControls && h('br', null),
    showControls && hasItems && makeControls(),
  ]);
};

const RequestMessageBodyComponent = ({ message, actions, showControls }) => {
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

const MessageComponent = ({ message, profile, profileName, setActiveMessage, showControls, inventory }) => {
  const { number, from: fromId, date } = message;
  const [errorText, setErrorText] = useState('');

  let MessageBodyComponent;
  if (message.type === 'request') {
    MessageBodyComponent = RequestMessageBodyComponent;
  } else if (message.type === 'package') {
    MessageBodyComponent = PackageMessageBodyComponent;
  } else {
    throw new Error(`Unknown message type: ${message.type}`);
  }

  const fromName = inventory.find(({ id }) => id === fromId)?.name;
  const whoText = fromName === 'SELF' ? `${profileName}` : `${fromName}`;

  const reportError = error => {
    setErrorText(error.message);
  };
  const actions = {
    dismiss: () => E(profile).dismiss(number).catch(reportError),
    resolve: value => E(profile).resolve(number, value).catch(reportError),
    reject: value => E(profile).reject(number, value).catch(reportError),
    adopt: (selectedName, asValue) =>
      E(profile).adopt(number, selectedName, asValue).catch(reportError),
    adoptApp: async (selectedName, asValue, powersName) => {
      const requestedPort = 1000 + Math.floor(9000 * Math.random())
      // adopt bundle
      const temporaryBundleName = `tmp-bundle-${asValue}`;
      await E(profile).adopt(number, selectedName, temporaryBundleName);
      // eval make weblet
      const weblet = await E(profile).evaluate(
        'MAIN',
        `E(apps).makeWeblet(bundle, powers, ${JSON.stringify(
          requestedPort,
        )}, $id, $cancelled)`,
        ['apps', 'bundle', 'powers'],
        ['APPS', temporaryBundleName, powersName],
        asValue,
      );
      // remove bundle
      await E(profile).remove(temporaryBundleName);
    }
  };

  return h('div', {
    onClick: () => setActiveMessage(message),
  }, [
    h('span', null, [
      formatChatTime(new Date(date)),
    ]),
    ' ',
    h('b', null, `${whoText}:`),
    h(MessageBodyComponent, { message, actions, showControls, nameIdPairs: inventory }),
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

const SendComponent = ({ profile, recipientName }) => {
  const [message, setMessage] = useState('');

  const submitMessage = () => {
    setMessage('');
    const { strings, edgeNames, petNames } = parseChatMessage(message);
    E(profile)
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

const ChatComponent = ({ profile, profileName, chatPartners, inventory }) => {
  const [activeMessage, setActiveMessage] = useState(false);
  const messages = useFollowMessages(() => E(profile).followMessages(), [profile]);
  const chatPartnerNames = chatPartners.map(({ name }) => name);
  const [specifiedRecipientName, setRecipientName] = useState();
  const recipientName = specifiedRecipientName || chatPartnerNames[0];
  const recipient = recipientName && chatPartners.find(({ name }) => name === recipientName);
  const recipientId = recipient && recipient.id;
  const currentMessages = messages.filter(message => {
    const { from, to } = message;
    return from === recipientId || to === recipientId;
  })

  const messageEntries = currentMessages.map(message => {
    const showControls = activeMessage === message;
    return h(MessageComponent, { message, profile, profileName, setActiveMessage, showControls, inventory });
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
      chatPartnerNames.map(name => h('option', { value: name }, name)),
    ),
    h('div', null, messageEntries),
    h(SendComponent, { profile, recipientName }),
  ]);
};

const InventoryEntryComponent = ({ profile, item }) => {
  const { name, type } = item;
  const isWebBundle = name.startsWith('app-');
  const webBundleLocation = useAsync(() => isWebBundle && E(E(profile).lookup(name)).getLocation(), [profile, name, isWebBundle])
  const typeDisplay = inventoryTypeDisplayDict[type] ?? type;
  return h('li', null, [
    `${name} `,
    h('i', null, `(${typeDisplay})`),
    ' ',
    h(
      // @ts-ignore
      'button',
      {
        onClick: () => E(profile).remove(name).catch(window.reportError),
      },
      'Remove',
    ),
    isWebBundle && webBundleLocation && h(
      // @ts-ignore
      'button',
      {
        onClick: () => {
          window.open(webBundleLocation, '_blank')
        },
      },
      'Open App',
    ),
  ]);
}

const InventoryComponent = ({ profile, inventory }) => {
  const inventoryMap = new Map()
  for (const item of inventory) {
    inventoryMap.set(item.name, item);
  }
  const sortedNames = [...inventoryMap.keys()].sort((a, b) => a.localeCompare(b));

  const inventoryEntries = sortedNames.map(name => {
    return h(InventoryEntryComponent, { profile, item: inventoryMap.get(name) });
  });

  return h(Fragment, null, [
    h('h2', null, 'Inventory'),
    h('ul', null, inventoryEntries),
  ]);
};

const BodyComponent = ({ powers }) => {
  const [currentProfileName, setCurrentProfileName] = useState('host');
  const currentProfile = useAsync(() => {
    if (currentProfileName === 'host') {
      return powers;
    }
    return E(powers).lookup(currentProfileName)
  }, [currentProfileName]);
  const inventoryEntries = useFollowChanges(() => currentProfile && E(currentProfile).followNameChangesWithType(), [currentProfile]);
  const inventory = inventoryEntries.map(({ name, value: { type, number, node }}) => {
    const id = formatId({ number, node });
    return { name, type, id, number, node };
  });
  const chatPartners = inventory.filter(({ type }) => type === 'remote');
  const guests = []
  const profiles = ['host', ...guests]

  return h(Fragment, null, [
    h('h1', {}, '🐈‍⬛'),
    h('span', {}, 'Logged in as: '),
    h(
      'select',
      {
        value: currentProfileName,
        onChange: e => setCurrentProfileName(e.target.value),
      },
      profiles.map(inbox => h('option', { value: inbox }, inbox)),
    ),
    currentProfile && h(InventoryComponent, { profile: currentProfile, inventory }),
    currentProfile && h(ChatComponent, { profile: currentProfile, profileName: currentProfileName, chatPartners, inventory }),
  ]);
};

export const make = async powers => {
  document.body.innerHTML = '';
  const app = h(BodyComponent, { powers });
  render(app, document.body);
};
