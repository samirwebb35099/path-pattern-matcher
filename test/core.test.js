import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compile, match } from '../src/index.js';

// ---- happy path ----------------------------------------------------------

test('exact literal pattern matches identical path', () => {
  assert.equal(match('src/index.js', 'src/index.js'), true);
});

// ---- single asterisk -----------------------------------------------------

test('single asterisk matches a single segment', () => {
  assert.equal(match('*.js', 'foo.js'), true);
});

test('single asterisk does not cross slashes', () => {
  assert.equal(match('*.js', 'a/b.js'), false);
});

test('single asterisk matches an empty run inside a segment', () => {
  // '*' is zero-or-more, so 'a*c' matches 'ac'. This is the conventional
  // glob reading.
  assert.equal(match('a*c', 'ac'), true);
});

test('single asterisk with surrounding literals', () => {
  assert.equal(match('src/*.ts', 'src/index.ts'), true);
  assert.equal(match('src/*.ts', 'src/sub/index.ts'), false);
});

// ---- double asterisk -----------------------------------------------------

test('double asterisk crosses directory boundaries', () => {
  assert.equal(match('src/**/*.js', 'src/a/b/c.js'), true);
});

test('double asterisk matches at the root of a tree', () => {
  // The pattern 'src/**/*.js' requires a slash between '**' and '*.js', so
  // a file directly under src/ is NOT matched. This documents the choice we
  // made: '**' here is greedy but does not absorb the following literal '/'.
  assert.equal(match('src/**/*.js', 'src/top.js'), false);
});

test('double asterisk at end matches everything beneath', () => {
  assert.equal(match('src/**', 'src/a/b/c.js'), true);
});

test('leading double asterisk anchors from anywhere', () => {
  assert.equal(match('**/config.json', 'a/b/config.json'), true);
});

// ---- edge cases ----------------------------------------------------------

test('empty pattern matches only empty path', () => {
  assert.equal(match('', ''), true);
  assert.equal(match('', 'x'), false);
});

test('non-string path returns false rather than throwing', () => {
  assert.equal(match('*.js', null), false);
  assert.equal(match('*.js', undefined), false);
  assert.equal(match('*.js', 42), false);
});

test('special regex metacharacters in pattern are escaped', () => {
  // A pattern containing '.' should match the literal dot, not act as a regex
  // wildcard. This is the main reason escapeLiteral() exists.
  assert.equal(match('config.json', 'configXjson'), false);
  assert.equal(match('config.json', 'config.json'), true);
});

test('compiled pattern is reusable', () => {
  const p = compile('src/*.js');
  assert.equal(p.test('src/a.js'), true);
  assert.equal(p.test('src/b.js'), true);
  assert.equal(p.test('src/sub/c.js'), false);
});

test('throws TypeError on non-string pattern', () => {
  assert.throws(() => compile(123), TypeError);
});

test('throws TypeError on pattern with line terminator', () => {
  // We refuse this input because the resulting regex would silently fail to
  // match anything sensible across lines.
  assert.throws(() => compile('foo\nbar'), TypeError);
});
