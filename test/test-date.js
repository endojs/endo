import test from 'tape';
import SES from '../src/index';

test('Date.now neutered by default', t => {
  const s = SES.makeSESRootRealm();
  t.equal(s.evaluate('Date.parse("1982-04-09")'), Date.parse('1982-04-09'));
  const now = s.evaluate('Date.now()');
  t.equal(Number.isNaN(now), true);
  const newDate = s.evaluate('new Date()');
  t.equal(`${newDate}`, 'Invalid Date');
  t.end();
});

test('Date.now neutered upon request', t => {
  const s = SES.makeSESRootRealm({ dateNowMode: false });
  t.equal(s.evaluate('Date.parse("1982-04-09")'), Date.parse('1982-04-09'));
  const now = s.evaluate('Date.now()');
  t.equal(Number.isNaN(now), true);
  const newDate = s.evaluate('new Date()');
  t.equal(`${newDate}`, 'Invalid Date');
  t.end();
});

test('Date.now can be left alone', t => {
  const start = Date.now();
  const s = SES.makeSESRootRealm({ dateNowMode: 'allow' });
  t.equal(s.evaluate('Date.parse("1982-04-09")'), Date.parse('1982-04-09'));
  const now = s.evaluate('Date.now()');
  const finished = Date.now();
  t.assert(Number.isInteger(now));
  t.assert(start <= now <= finished, (start, now, finished));
  const newDate = s.evaluate('new Date()');
  t.notEqual(`${newDate}`, 'Invalid Date');
  t.end();
});

// neither of these are supposed to work

test('get Date from new SES.makeSESRootRealm', t => {
  const s1 = SES.makeSESRootRealm(); // disable Date
  const s2 = s1.evaluate('SES.makeSESRootRealm({dateNowMode: "allow"})'); // reenable
  const now = s2.global.Date.now();
  t.equal(Number.isNaN(now), true);
  const newDate = s2.evaluate('new Date()');
  t.equal(`${newDate}`, 'Invalid Date');
  t.end();
});

test('get Date from new Realm', t => {
  const s1 = SES.makeSESRootRealm({ dateNowMode: false });
  const r2 = s1.evaluate('Realm.makeRootRealm()');
  const now = r2.global.Date.now();
  console.log('now is', now);
  t.equal(Number.isNaN(now), true);
  const newDate = r2.evaluate('new Date()');
  t.equal(`${newDate}`, 'Invalid Date');
  t.end();
});
