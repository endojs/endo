import test from 'tape';
import sinon from 'sinon';
import { getPrivateFields, setPrivateFields } from '../../src/privateFields';

test('privateFields - get/set fields', t => {
  t.plan(1);

  const instance = {};
  const fields = {};
  setPrivateFields(instance, fields);

  t.equals(getPrivateFields(instance), fields);
});

test('privateFields - fields not defined', t => {
  t.plan(1);

  sinon.stub(console, 'error').callsFake();

  const instance = {};
  t.throws(() => getPrivateFields(instance), /not defined/);

  sinon.restore();
});

test('privateFields - fields already defined', t => {
  t.plan(2);

  sinon.stub(console, 'error').callsFake();

  const instance = {};
  const fields = {};
  t.doesNotThrow(() => setPrivateFields(instance, fields));
  t.throws(() => setPrivateFields(instance, fields), /already defined/);

  sinon.restore();
});
