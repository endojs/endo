import test from 'tape';
import SES from '../src/index.js';

test('Date.now neutered by default', function(t) {
  const s = SES.makeSESRootRealm();
  t.equal(s.evaluate('Date.parse("1982-04-09")'), Date.parse('1982-04-09'));
  const now = s.evaluate('Date.now()');
  t.equal(Number.isNaN(now), true);
  t.end();
});

test('Date.now neutered upon request', function(t) {
  const s = SES.makeSESRootRealm({dateNowTrap: true});
  t.equal(s.evaluate('Date.parse("1982-04-09")'), Date.parse('1982-04-09'));
  const now = s.evaluate('Date.now()');
  t.equal(Number.isNaN(now), true);
  t.end();
});

test('Date.now can be left alone', function(t) {
  const start = Date.now();
  const s = SES.makeSESRootRealm({dateNowTrap: false});
  t.equal(s.evaluate('Date.parse("1982-04-09")'), Date.parse('1982-04-09'));
  const now = s.evaluate('Date.now()');
  const finished = Date.now();
  t.assert(Number.isInteger(now));
  t.assert(start <= now <= finished, (start, now, finished));
  t.end();
});
