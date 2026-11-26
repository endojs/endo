import test from 'ava';
import endoChangelogFunctions from './index.js';

// A changeset read from disk carries no `commit`, so `getReleaseLine` makes no
// GitHub API calls and needs no token.
const makeChangeset = summary => ({
  id: 'test-changeset',
  summary,
  releases: [],
});

test('getReleaseLine: collapses hard breaks and indents continuation paragraphs', async t => {
  const line = await endoChangelogFunctions.getReleaseLine(
    makeChangeset('First line\nstill first paragraph.\n\nSecond paragraph.'),
    'minor',
    { repo: 'endojs/endo' },
  );
  t.is(line, '\n\n- First line still first paragraph.\n\n  Second paragraph.');
});

test('getReleaseLine: leaves no whitespace-only lines between paragraphs', async t => {
  const line = await endoChangelogFunctions.getReleaseLine(
    makeChangeset('One.\n\nTwo.\n\nThree.'),
    'patch',
    { repo: 'endojs/endo' },
  );
  t.false(/^[ \t]+$/m.test(line), JSON.stringify(line));
});
