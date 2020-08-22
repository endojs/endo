export const parse = (source, location) => {
  try {
    return JSON.parse(source);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new SyntaxError(`Cannot parse JSON from ${location}, ${error}`);
    }
    throw error;
  }
};
