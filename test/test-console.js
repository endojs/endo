import test from 'tape';
import { SES } from '../src/index';

test('console disabled by default', t => {
  const s = SES.makeSESRootRealm({ errorStackMode: 'allow' });
  t.equal(typeof s.global.console, 'undefined');
  t.throws(
    () => s.evaluate('console.log("console is missing entirely")'),
    TypeError,
  );
  t.end();
});

test('console can be enabled', t => {
  const s = SES.makeSESRootRealm({ consoleMode: 'allow' });
  console.log('you should see 6 messages between here:');
  s.evaluate('console.log("1/6 log (internal)")');
  s.global.console.log('2/6 log (external)');
  s.evaluate('console.info("3/6 info")');
  s.evaluate('console.warn("4/6 warn")');
  s.evaluate('console.error("5/6 error")');
  s.evaluate('console.time("6/6 console.time")');
  s.evaluate('console.timeEnd("6/6 console.time")');
  console.log('and here');
  t.end();
});

test('console should be frozen', t => {
  const s = SES.makeSESRootRealm({ consoleMode: 'allow' });
  t.throws(() => s.evaluate('console.forbidden = 4'), TypeError);
  t.throws(() => s.evaluate('console.log = 4'), TypeError);
  t.throws(() => s.evaluate('console.log.forbidden = 4'), TypeError);
  t.end();
});
