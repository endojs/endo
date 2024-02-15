/**
 * @param {Array<string>} strings
 * @param {Array<string>} edgeNames
 */
export const formatMessage = (strings, edgeNames) => {
  let message = '';
  let index = 0;
  for (
    index = 0;
    index < Math.min(strings.length, edgeNames.length);
    index += 1
  ) {
    message += strings[index].replace(/@/g, '\\@');
    message += `@${edgeNames[index]}`;
  }
  if (strings.length > edgeNames.length) {
    message += strings[index].replace(/@/g, '\\@');
  }
  return JSON.stringify(message);
};
