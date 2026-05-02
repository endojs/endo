/* global Far */
const makeFormatter = version => {
  return Far('Formatter', {
    format(text) {
      return `[${version}] ${text}`;
    },
  });
};

export const make = _powers => {
  let currentFormatterVersion = 'v1';
  let posts = [];

  return Far('Blog', {
    async post(content) {
      try {
        const formatter = makeFormatter(currentFormatterVersion);
        const formatted = formatter.format(content);
        posts = [...posts, formatted];
      } catch (_e) {
        // Silently ignore errors for now
      }
    },
    async getPosts() {
      return harden([...posts]);
    },
    async upgradeFormatter() {
      currentFormatterVersion = currentFormatterVersion === 'v1' ? 'v2' : 'v3';
    },
  });
};
