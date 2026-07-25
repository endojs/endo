//! Static named-export detection for CommonJS sources, in the
//! spirit of Node's `cjs-module-lexer`: the archive builder scans a
//! CJS module's raw text for the export-assignment shapes that
//! transpilers and hand-written packages actually use, and the ESM
//! facade synthesizes a named export for each detected name so
//! `import { named } from 'cjsPkg'` links. Detection is heuristic by
//! design — Node's own interop accepts the same bargain: a lexed
//! name that the evaluated `module.exports` never receives simply
//! binds `undefined`, while a missed name still reaches importers
//! through the `default` namespace object.
//!
//! Recognized shapes:
//! - `exports.name = …` / `module.exports.name = …`
//! - `exports["name"] = …` / `module.exports['name'] = …`
//! - `Object.defineProperty(exports, "name", …)` (and
//!   `module.exports` as the target)
//! - `module.exports = { name, name2: …, "name3": …, name4() {} }`
//!   — top-level literal keys only; spreads and computed keys are
//!   skipped, nested braces are balanced past.
//!
//! Comments, string literals, template literals, and (heuristically)
//! regular-expression literals are skipped so text inside them never
//! yields a name. Re-export shapes (`module.exports = require(…)`,
//! `__exportStar(require(…), exports)`) are NOT chased across
//! modules; that remains a recorded design gap.

use std::collections::BTreeSet;

/// Words that cannot be synthesized as `export const <name>` in the
/// ESM facade: reserved words, contextual keywords that are illegal
/// as ESM binding names, and the interop names Node itself excludes.
const EXCLUDED_NAMES: &[&str] = &[
    // ECMAScript reserved words.
    "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do",
    "else", "enum", "export", "extends", "false", "finally", "for", "function", "if", "import",
    "in", "instanceof", "new", "null", "return", "super", "switch", "this", "throw", "true",
    "try", "typeof", "var", "void", "while", "with",
    // Illegal or hazardous as module-level `const` binding names.
    "let", "static", "yield", "await", "implements", "interface", "package", "private",
    "protected", "public", "arguments", "eval",
    // Interop names the facade already owns.
    "__esModule",
];

/// True when `name` may be emitted as `export const <name>` — an
/// ECMAScript identifier (ASCII subset; non-ASCII names are rare in
/// export position and safely fall back to the default namespace)
/// that is not reserved.
fn is_exportable_identifier(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first.is_ascii_alphabetic() || first == '_' || first == '$') {
        return false;
    }
    if !chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$') {
        return false;
    }
    !EXCLUDED_NAMES.contains(&name)
}

/// A source token significant to the scanner: everything except
/// comments and the interiors of string/template/regex literals.
#[derive(Debug, Clone, PartialEq)]
enum Token {
    Ident(String),
    Str(String),
    Punct(char),
}

/// Tokenize `source`, skipping comments and collapsing string
/// literals to their contents. Template literals are skipped
/// entirely (their `${}` interpolations too — a rare loss accepted
/// for scanner simplicity; cjs-module-lexer skips them likewise).
/// Regex literals are recognized by the previous significant token,
/// the classic heuristic: a `/` after an identifier, string, `)`, or
/// `]` divides; anywhere else it starts a regex.
fn tokenize(source: &str) -> Vec<Token> {
    let bytes = source.as_bytes();
    let mut tokens = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i] as char;
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        if c == '/' && i + 1 < bytes.len() {
            match bytes[i + 1] as char {
                '/' => {
                    while i < bytes.len() && bytes[i] != b'\n' {
                        i += 1;
                    }
                    continue;
                }
                '*' => {
                    i += 2;
                    while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                        i += 1;
                    }
                    i = (i + 2).min(bytes.len());
                    continue;
                }
                _ => {}
            }
        }
        if c == '"' || c == '\'' {
            let quote = bytes[i];
            i += 1;
            let start = i;
            while i < bytes.len() && bytes[i] != quote {
                if bytes[i] == b'\\' {
                    i += 1;
                }
                i += 1;
            }
            let content = String::from_utf8_lossy(&bytes[start..i.min(bytes.len())]).into_owned();
            tokens.push(Token::Str(content));
            i = (i + 1).min(bytes.len());
            continue;
        }
        if c == '`' {
            // Skip the template literal wholesale, balancing nested
            // `${ … }` interpolations (which may themselves contain
            // templates).
            i += 1;
            let mut depth: Vec<u32> = Vec::new();
            while i < bytes.len() {
                match bytes[i] {
                    b'\\' => i += 1,
                    b'$' if i + 1 < bytes.len() && bytes[i + 1] == b'{' => {
                        depth.push(0);
                        i += 1;
                    }
                    b'{' if !depth.is_empty() => {
                        *depth.last_mut().unwrap() += 1;
                    }
                    b'}' if !depth.is_empty() => {
                        let d = depth.last_mut().unwrap();
                        if *d == 0 {
                            depth.pop();
                        } else {
                            *d -= 1;
                        }
                    }
                    b'`' if depth.is_empty() => {
                        break;
                    }
                    _ => {}
                }
                i += 1;
            }
            i = (i + 1).min(bytes.len());
            continue;
        }
        if c == '/' {
            // Division or regex, by the previous significant token.
            let divides = matches!(
                tokens.last(),
                Some(Token::Ident(name)) if name != "return" && name != "typeof" && name != "case"
                    && name != "in" && name != "of" && name != "instanceof" && name != "new"
                    && name != "delete" && name != "void" && name != "do" && name != "else"
            ) || matches!(tokens.last(), Some(Token::Str(_)) | Some(Token::Punct(')')) | Some(Token::Punct(']')));
            if divides {
                tokens.push(Token::Punct('/'));
                i += 1;
                continue;
            }
            // Skip the regex literal body and flags.
            i += 1;
            let mut in_class = false;
            while i < bytes.len() {
                match bytes[i] {
                    b'\\' => i += 1,
                    b'[' => in_class = true,
                    b']' => in_class = false,
                    b'/' if !in_class => break,
                    b'\n' => break,
                    _ => {}
                }
                i += 1;
            }
            i += 1;
            while i < bytes.len() && (bytes[i] as char).is_ascii_alphanumeric() {
                i += 1;
            }
            continue;
        }
        if c.is_ascii_alphanumeric() || c == '_' || c == '$' {
            let start = i;
            while i < bytes.len() {
                let b = bytes[i] as char;
                if b.is_ascii_alphanumeric() || b == '_' || b == '$' {
                    i += 1;
                } else {
                    break;
                }
            }
            tokens.push(Token::Ident(
                String::from_utf8_lossy(&bytes[start..i]).into_owned(),
            ));
            continue;
        }
        if c.is_ascii() {
            tokens.push(Token::Punct(c));
        }
        i += 1;
    }
    tokens
}

/// True when `tokens[i..]` begins `module . exports`; returns the
/// index just past `exports`.
fn after_module_exports(tokens: &[Token], i: usize) -> Option<usize> {
    if matches!(tokens.get(i), Some(Token::Ident(w)) if w == "module")
        && matches!(tokens.get(i + 1), Some(Token::Punct('.')))
        && matches!(tokens.get(i + 2), Some(Token::Ident(w)) if w == "exports")
    {
        Some(i + 3)
    } else {
        None
    }
}

/// True when the token at `i` references the exports object —
/// either the bare `exports` identifier or `module.exports` —
/// returning the index just past the reference.
fn after_exports_ref(tokens: &[Token], i: usize) -> Option<usize> {
    if let Some(j) = after_module_exports(tokens, i) {
        return Some(j);
    }
    if matches!(tokens.get(i), Some(Token::Ident(w)) if w == "exports") {
        // Reject `foo.exports` — the reference must not be a member
        // access on something other than `module`.
        if i > 0 && matches!(tokens.get(i - 1), Some(Token::Punct('.'))) {
            return None;
        }
        return Some(i + 1);
    }
    None
}

/// Collect the top-level literal keys of an object literal whose `{`
/// is at `tokens[i]`, appending exportable names to `names`. Values
/// are balanced past (nested `{}`, `()`, `[]`); spreads and computed
/// keys are skipped.
fn collect_object_literal_keys(tokens: &[Token], i: usize, names: &mut BTreeSet<String>) {
    debug_assert!(matches!(tokens.get(i), Some(Token::Punct('{'))));
    let mut j = i + 1;
    loop {
        // At a key position (or the closing brace).
        match tokens.get(j) {
            None | Some(Token::Punct('}')) => return,
            Some(Token::Punct(',')) => {
                j += 1;
                continue;
            }
            Some(Token::Ident(name)) => {
                let name = name.clone();
                // `get name() {}` / `set name() {}` / `async name() {}`:
                // the accessor/modifier word is followed by another
                // identifier key rather than `:`/`,`/`(`/`}`.
                if (name == "get" || name == "set" || name == "async")
                    && matches!(tokens.get(j + 1), Some(Token::Ident(_)) | Some(Token::Str(_)))
                {
                    j += 1;
                    continue;
                }
                match tokens.get(j + 1) {
                    // `name: value` or `name() {}` — a real key.
                    Some(Token::Punct(':')) | Some(Token::Punct('(')) => {
                        if is_exportable_identifier(&name) {
                            names.insert(name);
                        }
                        j = skip_value(tokens, j + 1);
                    }
                    // Shorthand `name,` or trailing `name}`.
                    Some(Token::Punct(',')) | Some(Token::Punct('}')) | None => {
                        if is_exportable_identifier(&name) {
                            names.insert(name);
                        }
                        j += 1;
                    }
                    _ => {
                        j = skip_value(tokens, j + 1);
                    }
                }
            }
            Some(Token::Str(name)) => {
                let name = name.clone();
                if matches!(tokens.get(j + 1), Some(Token::Punct(':')))
                    && is_exportable_identifier(&name)
                {
                    names.insert(name);
                }
                j = skip_value(tokens, j + 1);
            }
            // Spread, computed key, or anything else: balance past it.
            _ => {
                j = skip_value(tokens, j);
            }
        }
    }
}

/// Advance past a value expression starting at `tokens[i]` until a
/// top-level `,` or `}` (returning that index), balancing nested
/// brackets.
fn skip_value(tokens: &[Token], i: usize) -> usize {
    let mut depth = 0i32;
    let mut j = i;
    while let Some(tok) = tokens.get(j) {
        match tok {
            Token::Punct('{') | Token::Punct('(') | Token::Punct('[') => depth += 1,
            Token::Punct('}') | Token::Punct(')') | Token::Punct(']') => {
                if depth == 0 {
                    return j;
                }
                depth -= 1;
            }
            Token::Punct(',') if depth == 0 => return j,
            _ => {}
        }
        j += 1;
    }
    j
}

/// Scan a CommonJS source for the names its `module.exports` is
/// statically seen to receive, in `cjs-module-lexer` spirit.
/// Returns a deterministic sorted set.
pub fn detect_named_exports(source: &str) -> BTreeSet<String> {
    let tokens = tokenize(source);
    let mut names = BTreeSet::new();
    let mut i = 0;
    while i < tokens.len() {
        // `Object.defineProperty(exports|module.exports, "name", …)`
        if matches!(&tokens[i], Token::Ident(w) if w == "Object")
            && matches!(tokens.get(i + 1), Some(Token::Punct('.')))
            && matches!(tokens.get(i + 2), Some(Token::Ident(w)) if w == "defineProperty")
            && matches!(tokens.get(i + 3), Some(Token::Punct('(')))
        {
            if let Some(j) = after_exports_ref(&tokens, i + 4) {
                if matches!(tokens.get(j), Some(Token::Punct(','))) {
                    if let Some(Token::Str(name)) = tokens.get(j + 1) {
                        if is_exportable_identifier(name) {
                            names.insert(name.clone());
                        }
                    }
                }
            }
            i += 4;
            continue;
        }
        if let Some(j) = after_exports_ref(&tokens, i) {
            // Assignment position only: `… = `, not `==`/`===`/`=>`.
            let assigns_at = |k: usize| {
                matches!(tokens.get(k), Some(Token::Punct('=')))
                    && !matches!(tokens.get(k + 1), Some(Token::Punct('=')) | Some(Token::Punct('>')))
            };
            // `exports.name = …` / `module.exports.name = …`
            if matches!(tokens.get(j), Some(Token::Punct('.'))) {
                if let Some(Token::Ident(name)) = tokens.get(j + 1) {
                    if name != "exports" && assigns_at(j + 2) && is_exportable_identifier(name) {
                        names.insert(name.clone());
                    }
                }
            }
            // `exports["name"] = …`
            if matches!(tokens.get(j), Some(Token::Punct('['))) {
                if let (Some(Token::Str(name)), Some(Token::Punct(']'))) =
                    (tokens.get(j + 1), tokens.get(j + 2))
                {
                    if assigns_at(j + 3) && is_exportable_identifier(name) {
                        names.insert(name.clone());
                    }
                }
            }
            // `module.exports = { … }` — literal keys become names.
            // Only for the two-token `module.exports` form: a bare
            // `exports = {…}` rebinding does not change what Node
            // returns from `require`.
            if after_module_exports(&tokens, i).is_some()
                && assigns_at(j)
                && matches!(tokens.get(j + 1), Some(Token::Punct('{')))
            {
                collect_object_literal_keys(&tokens, j + 1, &mut names);
            }
            i = j;
            continue;
        }
        i += 1;
    }
    names
}

#[cfg(test)]
mod tests {
    use super::*;

    fn detect(src: &str) -> Vec<String> {
        detect_named_exports(src).into_iter().collect()
    }

    #[test]
    fn detects_exports_dot_assignments() {
        assert_eq!(
            detect("exports.alpha = 1;\nmodule.exports.beta = 2;\n"),
            vec!["alpha", "beta"]
        );
    }

    #[test]
    fn detects_bracket_string_assignments() {
        assert_eq!(detect("exports[\"gamma\"] = 3;\nexports['delta'] = 4;"), vec!["delta", "gamma"]);
    }

    #[test]
    fn detects_define_property() {
        assert_eq!(
            detect("Object.defineProperty(exports, \"prop\", { get: function () { return 1; } });"),
            vec!["prop"]
        );
        assert_eq!(
            detect("Object.defineProperty(module.exports, 'val', { value: 2 });"),
            vec!["val"]
        );
    }

    #[test]
    fn detects_object_literal_keys() {
        assert_eq!(
            detect("module.exports = { parse, valid: v, 'clean': c, satisfies(a, b) { return 1; } };"),
            vec!["clean", "parse", "satisfies", "valid"]
        );
    }

    #[test]
    fn object_literal_skips_nested_and_computed() {
        assert_eq!(
            detect("module.exports = { outer: { inner: 1 }, [computed]: 2, ...spread, fn: () => ({ x: 1 }) };"),
            vec!["fn", "outer"]
        );
    }

    #[test]
    fn object_literal_accessors_and_async_methods() {
        assert_eq!(
            detect("module.exports = { get g() { return 1; }, set s(v) {}, async a() {} };"),
            vec!["a", "g", "s"]
        );
    }

    #[test]
    fn skips_text_in_comments_strings_and_templates() {
        let src = "// exports.commented = 1;\n\
                   /* exports.blocked = 2; */\n\
                   var s = 'exports.quoted = 3;';\n\
                   var t = `exports.templated = ${'exports.interpolated = 5;'}`;\n\
                   exports.real = 4;\n";
        assert_eq!(detect(src), vec!["real"]);
    }

    #[test]
    fn skips_regex_literals() {
        let src = "var re = /exports\\.fake = 1;/g;\nexports.actual = 2;\n";
        assert_eq!(detect(src), vec!["actual"]);
    }

    #[test]
    fn division_is_not_regex() {
        let src = "var x = a / b; exports.q = x / 2;\n";
        assert_eq!(detect(src), vec!["q"]);
    }

    #[test]
    fn transpiler_esmodule_pattern() {
        let src = "Object.defineProperty(exports, \"__esModule\", { value: true });\n\
                   exports.foo = exports.bar = void 0;\n\
                   exports.foo = function () {};\n\
                   exports.bar = 7;\n";
        assert_eq!(detect(src), vec!["bar", "foo"]);
    }

    #[test]
    fn excludes_reserved_and_invalid_names() {
        let src = "exports.default = 1;\nexports['not-an-ident'] = 2;\n\
                   exports['class'] = 3;\nexports.__esModule = true;\nexports.ok = 4;\n";
        assert_eq!(detect(src), vec!["ok"]);
    }

    #[test]
    fn ignores_comparisons_and_reads() {
        let src = "if (exports.probe === undefined) { use(exports.probe); }\n\
                   var alias = module.exports;\n";
        assert!(detect(src).is_empty());
    }

    #[test]
    fn ignores_other_objects_named_exports() {
        let src = "foo.exports.nope = 1;\nvar exportsLike = {}; exportsLike.nah = 2;\n";
        assert!(detect(src).is_empty());
    }

    #[test]
    fn module_exports_replacement_by_non_literal_yields_nothing() {
        assert!(detect("module.exports = require('./other');\n").is_empty());
        assert!(detect("module.exports = someFactory();\n").is_empty());
    }
}
