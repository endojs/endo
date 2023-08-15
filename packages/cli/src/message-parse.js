const pattern = /@([a-z][a-z0-9-]{0,127})(?::([a-z][a-z0-9-]{0,127}))?/g;

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

// console.log(parseMessage('before @pet-name:edge-name and @other-pet-name to the end'));
// console.log(parseMessage('@pet-name'));
// console.log(parseMessage('@pet-name:edge-name'));
// console.log(parseMessage('@pet-name:edge-name trailer'));
// console.log(parseMessage('header @pet-name:edge-name trailer'));
