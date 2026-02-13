// @ts-check

const pattern = /@([a-z][a-z0-9-]{0,127})(?::([a-z][a-z0-9-]{0,127}))?/g;

/**
 * Parse a message string for pet name references.
 *
 * @param {string} message - The message to parse
 * @returns {{ strings: string[], petNames: string[], edgeNames: string[] }}
 */
export const parseMessage = message => {
  const strings = [];
  const petNames = [];
  const edgeNames = [];
  let start = 0;
  message.replace(pattern, (match, edgeName, petName, stop) => {
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
