export const makeKumavisStore = async ({ persistenceNode }, initState) => {
  const marshall = state => state;
  const unmarshall = state => state;
  const serialize = state => JSON.stringify(state);
  const deserialize = string => JSON.parse(string);
  const read = async () =>
    persistenceNode.get()
      ? unmarshall(deserialize(persistenceNode.get()))
      : initState;
  const write = async state => persistenceNode.set(serialize(marshall(state)));

  let state = await read();
  const store = {
    get: () => state,
    set: async newState => {
      state = newState;
      await write(state);
    },
    update: async partial => {
      state = { ...state, ...partial };
      await write(state);
    },
  };
  return store;
};
