/**
 * Match file paths against simple glob patterns containing single (*) and
 * double (**) wildcards.
 *
 * The implementation is an iterative two-stage compiler: first convert the
 * glob into a flat list of tokens, then turn those tokens into a RegExp.
 *
 * Two-stage design rationale: keeping the tokeniser separate from the
 * regex-builder makes both stages trivial to reason about. We only need to
 * reject truly unsupported input at the tokeniser; the regex builder then
 * just walks the token list. This is a fraction of the size of a full glob
 * engine.
 */

/**
 * Precompiled pattern. Construct via `compile(pattern)`, then call
 * `test(path)` to match.
 */
export class CompiledPattern {
  constructor(pattern, regex) {
    this.pattern = pattern;
    this.regex = regex;
  }

  test(path) {
    if (typeof path !== 'string') return false;
    return this.regex.test(path);
  }
}

/**
 * Token kind constants. Using plain string literals instead of a Symbol or
 * enum keeps the serialised bundle small and avoids requiring TypeScript
 * type definitions to resolve them.
 */
const T_LITERAL = 'literal';
const T_SINGLE = 'single';   // '*'  — matches any characters except /
const T_DOUBLE = 'double';   // '**' — matches any characters including /
const T_SLASH = 'slash';

/**
 * Tokenise a glob pattern into a flat list of tokens.
 *
 * @param {string} pattern
 * @returns {Array<{kind:string, value:string}>}
 * @throws {TypeError} if pattern is not a string or contains characters that
 *   would require regex escaping beyond what a careful glob engine should
 *   handle (e.g. line terminators). The library deliberately refuses to
 *   attempt support for such input rather than silently misbehaving.
 */
function tokenize(pattern) {
  if (typeof pattern !== 'string') {
    throw new TypeError('pattern must be a string');
  }
  // A pattern with a line terminator would silently break the regex; refuse it
  // up front so the caller knows exactly where the limit is.
  if (/\r|\n/.test(pattern)) {
    throw new TypeError('pattern may not contain line terminators');
  }

  const tokens = [];
  let i = 0;
  const n = pattern.length;

  while (i < n) {
    const ch = pattern[i];

    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        tokens.push({ kind: T_DOUBLE, value: '**' });
        i += 2;
      } else {
        tokens.push({ kind: T_SINGLE, value: '*' });
        i += 1;
      }
      continue;
    }

    if (ch === '/') {
      tokens.push({ kind: T_SLASH, value: '/' });
      i += 1;
      continue;
    }

    // Accumulate a run of literal characters. Bundling them avoids one regex
    // fragment per character, which matters for patterns that embed long
    // directory names.
    let buf = '';
    while (i < n) {
      const c = pattern[i];
      if (c === '*' || c === '/') break;
      buf += c;
      i += 1;
    }
    tokens.push({ kind: T_LITERAL, value: buf });
  }

  return tokens;
}

/**
 * Escape a literal string for use inside a RegExp. Covers the characters that
 * `new RegExp()` treats as metacharacters; anything else passes through
 * untouched, which is what we want.
 */
function escapeLiteral(s) {
  // `$&` in the replacement string means "the matched substring"; this is
  // standard ECMAScript, not a Node quirk.
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Turn a token list into a RegExp anchored at both ends.
 *
 * @param {Array<{kind:string, value:string}>} tokens
 * @returns {RegExp}
 */
function buildRegex(tokens) {
  let src = '^';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.kind) {
      case T_LITERAL:
        src += escapeLiteral(t.value);
        break;
      case T_SLASH:
        src += '/';
        break;
      case T_SINGLE:
        // '*' does not cross path separators; this mirrors the common glob
        // convention (POSIX fnmatch with FNM_PATHNAME). We always require the
        // separator to appear verbatim, so the gap is [^/]*.
        src += '[^/]*';
        break;
      case T_DOUBLE:
        // '**' crosses separators. We treat a bare '**' as "any sequence of
        // characters, including /". This is the behaviour described in the
        // README and is the one most callers expect for "ignore everything
        // under a directory" use cases.
        //
        // A pathological run like '**/**/**' is harmless: each adds '.*', and
        // '.*.*.*' is equivalent to '.*' in JavaScript's NFA regex engine.
        src += '.*';
        break;
      default:
        throw new Error('internal error: unknown token kind ' + t.kind);
    }
  }
  src += '$';
  return new RegExp(src);
}

/**
 * Compile a glob pattern into a reusable matcher.
 *
 * @param {string} pattern
 * @returns {CompiledPattern}
 */
export function compile(pattern) {
  const tokens = tokenize(pattern);
  const regex = buildRegex(tokens);
  return new CompiledPattern(pattern, regex);
}

/**
 * Test whether `path` matches `pattern`. Equivalent to
 * `compile(pattern).test(path)` but avoids the caller holding the compiled
 * object when they only need a one-shot answer.
 *
 * @param {string} pattern
 * @param {string} path
 * @returns {boolean}
 */
export function match(pattern, path) {
  return compile(pattern).test(path);
}
