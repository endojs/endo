import test from 'ava';
import { parse } from '@babel/parser';
import babelTraverse from '@babel/traverse';
import babelGenerate from '@babel/generator';
import { createEvasiveTransformPass } from '../src/transform-pass.js';

const traverse = babelTraverse.default || babelTraverse;
const generate = babelGenerate.default || babelGenerate;

test('createEvasiveTransformPass returns a TransformPass', t => {
  const pass = createEvasiveTransformPass();
  t.is(typeof pass.visitor, 'object');
  t.truthy(pass.visitor.enter);
});

test('evasive transform pass defangs import() in strings', t => {
  const source = `const x = "import('foo')";`;
  const ast = parse(source, { sourceType: 'module' });
  const pass = createEvasiveTransformPass();
  traverse(ast, pass.visitor);
  const { code } = generate(ast);
  t.false(code.includes(`import('foo')`));
});

test('evasive transform pass rewrites HTML comments', t => {
  const source = `const x = 1; /* <!-- comment --> */`;
  const ast = parse(source, { sourceType: 'module' });
  const pass = createEvasiveTransformPass();
  traverse(ast, pass.visitor);
  const { code } = generate(ast);
  t.false(code.includes('<!--'));
});

test('evasive transform pass respects elideComments option', t => {
  const source = `/* some comment */ const x = 1;`;
  const ast = parse(source, { sourceType: 'module' });
  const pass = createEvasiveTransformPass({ elideComments: true });
  traverse(ast, pass.visitor);
  const { code } = generate(ast);
  t.false(code.includes('some comment'));
});

test('evasive transform pass with onlyComments skips code transforms', t => {
  const source = `const x = "import('foo')"; /* <!-- --> */`;
  const ast = parse(source, { sourceType: 'module' });
  const pass = createEvasiveTransformPass({ onlyComments: true });
  traverse(ast, pass.visitor);
  const { code } = generate(ast);
  t.true(code.includes(`import('foo')`), 'string should not be modified');
  t.false(code.includes('<!--'), 'comment should still be rewritten');
});
