export const parse = (source, location) => {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new SyntaxError(`Cannot parse JSON from ${location}, ${error}`);
  }
};
