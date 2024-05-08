import React from 'react';
import { h } from './util.js';

// helper for endo daemon object list
// subscribes to Endo Topic changes, optimized for arrays
// YIKES: THIS IS NOT WORKING CORRECTLY !!!!
const useBrokenSubscriptionForArray = (getSubFn, deps) => {
  const [state, setState] = React.useState([]);

  React.useEffect(() => {
    setState([]);
    const sub = getSubFn()
    if (sub === undefined) {
      console.warn('sub is undefined')
      return;
    }
    let shouldAbort = false;
    const iterateChanges = async () => {
      for await (const change of sub) {
        // Check if we should abort iteration
        if (shouldAbort) {
          break;
        }
        // apply change
        setState(prevState => {
          if ('add' in change) {
            const name = change.add;
            return [...prevState, name];
          } else if ('remove' in change) {
            const name = change.remove;
            prevState.splice(prevState.indexOf(name), 1);
            return prevState;
          }
          return prevState;
        });
      }
    }
    // start iteration
    iterateChanges()
    // cleanup
    return () => {
      shouldAbort = true;
    }
  }, deps);

  return state;
}

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
export const ObjectsListComponent = ({ inventory, addAction, filterFn = filterNoop }) => {
  const names = useBrokenSubscriptionForArray(
    () => inventory.subscribeToNames(),
    [],
  )
  
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
          h(ObjectsListObjectComponent, { addAction, name }),
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
