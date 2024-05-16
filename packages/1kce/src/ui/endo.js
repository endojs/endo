import React from 'react';
import { h } from './util.js';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
// bundler compat issue?
const { Fragment, useEffect, useState } = React;

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

export const ObjectsListObjectComponent = ({ addAction, name }) => {
  return (
    h('div', {}, [
      h('span', { key: 'name'}, [name]),
      h('button', {
        key: 'add',
        onClick: async () => {
          await addAction(name)
        },
        style: {
          margin: '6px',
        },
      }, ['Add to Deck']),
    ])
  )
}

const filterNoop = () => true
export const ObjectsListComponent = ({ actions, addAction, filterFn = filterNoop }) => {
  const inventory = useFollowChanges(() => actions.subscribeToNames(), [])
  const names = inventory.map(({ name }) => name)
  const uniqueNames = [...new Set(names)].filter(filterFn)
  let objectList
  if (uniqueNames.length === 0) {
    objectList = 'No objects found.'
  } else {
    objectList = uniqueNames.map(name => {
      return h('li', {
        key: name,
      }, [
        h('span', null, [
          h(ObjectsListObjectComponent, { addAction, name, key: name }),
        ]),
      ])
    })
  }

  return (
    h('div', {}, [
      h('h3', { key: 'title' }, ['Inventory']),
      h('ul', { key: 'list' }, objectList),
    ])
  )
};
