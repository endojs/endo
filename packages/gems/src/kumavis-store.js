const walkJson = (obj, handler) => {
  // Loop through each key in the object
  for (const key in obj) {
    // Check if the key belongs to the object itself (not inherited)
    if (Reflect.has(obj, key)) {
      // Call the handler function with the current key and value
      handler(obj, key, obj[key]);
      // If the value is an object (and not null), recurse into it
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        walkJson(obj[key], handler);
      }
    }
  }
};

const isRemoteRef = ref =>
  typeof ref === 'object' &&
  !Array.isArray(ref) &&
  String(ref).includes('Alleged:');

export const makeKumavisStore = async (
  { persistenceNode, retentionSet, gemLookup },
  initState,
) => {
  // turns gemRefs into prefixed strings
  // and escapes ordinary strings
  const marshall = state => {
    if (retentionSet) retentionSet.clear();
    walkJson(state, (parent, key, value) => {
      if (typeof value === 'string') {
        parent[key] = `string:${value}`;
      } else if (isRemoteRef(value)) {
        const gemId = gemLookup.getGemId(value);
        parent[key] = gemId;
        if (retentionSet) retentionSet.add(gemId);
      }
    });
    return state;
  };
  // turns prefixed strings back into strings
  // and looks up gemRefs by id
  const unmarshall = state => {
    walkJson(state, (parent, key, value) => {
      if (typeof value === 'string') {
        if (value.startsWith('string:')) {
          parent[key] = value.slice('string:'.length);
        } else if (value.startsWith('gem:')) {
          parent[key] = gemLookup.getGemById(value);
        } else {
          throw new Error('Unexpected unescaped string value in state');
        }
      }
    });
    return state;
  };
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
