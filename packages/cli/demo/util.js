import { makeChangeTopic } from '@endo/daemon/pubsub.js';

export const makeTrackedArray = () => {
  const topic = makeChangeTopic();
  const array = [];

  const shadow = Object.create(array)
  shadow.push = (item) => {
    array.push(item);
    topic.publisher.next({ add: item });
  }
  shadow.subscribe = () => {
    return topic.subscribe();
  }
  shadow.follow = () => {
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