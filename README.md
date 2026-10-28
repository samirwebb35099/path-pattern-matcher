# path-pattern-matcher

Matches file paths against simple glob patterns containing single (`*`) and
double (`**`) wildcards, without invoking a full glob engine.

## Usage

```js
import { compile, match } from 'path-pattern-matcher';

// One-shot:
match('src/**/*.js', 'src/a/b/c.js'); // true

// Reusable:
const p = compile('src/*.ts');
p.test('src/index.ts'); // true
p.test('src/sub/index.ts'); // false
```

## Why this exists

A surprising number of tools pull in a full glob library just to answer the
question "does this path look like these files?". That is overkill when you
only need `*` (matches within one path segment) and `**` (matches across
segments). This library implements exactly those two operators with a
two-stage compiler: tokenise the pattern, then emit a RegExp. No filesystem
access, no brace expansion, no character classes.

The trade-off is that anything more elaborate than `*` and `**` — such as
`[abc]`, `{a,b}`, or `?` — is intentionally not supported. Patterns containing
those characters will treat them as literals, not as glob operators.

## Edge you will hit

`**` in this library means "any sequence of characters, including `/`". A
pattern like `src/**/*.js` therefore requires at least one directory level
between `src/` and the `.js` file: `src/top.js` will NOT match, because the
`**` is followed by a literal `/` in the pattern. If you want to match files
directly under `src/` as well, write `src/**.js` instead (no slash before the
`*`), or provide two patterns.

## Exports

- `compile(pattern: string): CompiledPattern` — returns an object with a
  `pattern` string, a `regex` (the underlying `RegExp`), and a `test(path)`
  method returning `boolean`.
- `match(pattern: string, path: string): boolean` — convenience wrapper for
  `compile(pattern).test(path)`. Returns `false` (never throws) when `path`
  is not a string.

## Errors

`compile()` throws `TypeError` if `pattern` is not a string or contains a line
terminator (`\n` or `\r`), since either would produce a silently broken
regex.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

