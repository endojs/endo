import { createElement } from './util.js';

export const App = () => {
  return createElement('div', {}, [
    createElement(
      'h1',
      {
        key: 'title',
        style: {
          display: 'inline',
          border: '2px solid black',
          borderRadius: '12px',
          padding: '4px',
          background: 'white',
          fontSize: '42px',
        },
      },
      ['😈DaemonMask🎭'],
    ),
  ]);
};
