import { makeChangeTopic } from '@endo/daemon/pubsub.js';

export const makeTrackedArrayValue = () => {
  const value = makeTrackedValue([])

  function push (item) {
    const array = value.get().slice()
    array.push(item);
    value.set(array)
  }
  function remove (item) {
    const array = value.get().slice()
    array.splice(array.indexOf(item), 1);
    value.set(array)
  }
  function splice (index, length) {
    const array = value.get().slice()
    const removed = array.splice(index, length);
    value.set(array)
    return removed
  }

  function slice (from, to) {
    const array = value.get().slice(from, to)
    return array
  }
  function indexOf (element) {
    const array = value.get()
    return array.indexOf(element)
  }

  function follow () {
    return value.follow();
  }

  return {
    push,
    remove,
    splice,
    slice,
    indexOf,
    follow,
  }
};

// not working correctly in some cases!
export const makeTrackedArray = () => {
  const topic = makeChangeTopic();
  const array = [];

  const shadow = Object.create(array, {
    push: { value: push },
    remove: { value: remove },
    splice: { value: splice },
    subscribe: { value: subscribe },
    follow: { value: follow },
  })
  function push (item) {
    array.push(item);
    topic.publisher.next({ add: item });
  }
  function remove (item) {
    array.splice(array.indexOf(item), 1);
    topic.publisher.next({ remove: item });
  }
  function splice (index, length) {
    const removed = array.splice(index, length);
    for (const item of removed) {
      shadow.remove(item);
    }
  }
  function subscribe () {
    return topic.subscribe();
  }
  function follow () {
    return (async function* currentAndSubsequentEntries() {
      const changes = topic.subscribe();
      for (const entry of array) {
        yield { add: entry };
      }
      yield* changes;
    })();
  }
  return shadow;
};

export const makeTrackedValue = (initValue) => {
  const topic = makeChangeTopic();
  let value = initValue;

  const trackedValue = {}
  trackedValue.set = (item) => {
    value = item
    topic.publisher.next({ value: item });
  }
  trackedValue.get = () => {
    return value
  }
  trackedValue.follow = () => {
    return (async function* currentAndSubsequentEntries() {
      const changes = topic.subscribe();
      yield { value: value };
      yield* changes;
    })();
  }
  return trackedValue;
};