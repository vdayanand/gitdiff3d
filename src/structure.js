const path = require("node:path");

const CONTROL = /^(?:if|for|while|switch|catch|else|do|try|return|new|function|await|typeof|case|with)$/;

const CLIKE = {
  name: "c-like",
  scope: "braces",
  comment: /^\s*(?:\/\/|\/\*|\*(?!\/)|\*\/)/,
  declarations: [
    { kind: "type", re: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:public\s+|private\s+)?(?:class|interface|enum|struct|trait|impl|namespace)\s+([A-Za-z_$][\w$]*)/ },
    { kind: "function", re: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|func|fn|sub)\s+\*?\s*([A-Za-z_$][\w$]*)/ },
    { kind: "function", re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/ },
    { kind: "method", re: /^\s+(?:public\s+|private\s+|protected\s+|static\s+|override\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[^{;]+)?\{\s*$/, not: CONTROL },
  ],
};

const INDENTED = (declarations) => ({
  name: "indented",
  scope: "indent",
  comment: /^\s*(?:#|--|%)/,
  declarations,
});

const PYTHON = INDENTED([
  { kind: "type", re: /^\s*class\s+([A-Za-z_]\w*)/ },
  { kind: "function", re: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/ },
]);

const JULIA = INDENTED([
  { kind: "type", re: /^\s*(?:mutable\s+)?(?:struct|abstract\s+type|module)\s+([A-Za-z_]\w*)/ },
  { kind: "function", re: /^\s*(?:function|macro)\s+([A-Za-z_]\w*)/ },
]);

const RUBY = INDENTED([
  { kind: "type", re: /^\s*(?:class|module)\s+([A-Za-z_]\w*)/ },
  { kind: "function", re: /^\s*def\s+(?:self\.)?([A-Za-z_]\w*[?!]?)/ },
]);

const BY_EXTENSION = {
  ".js": CLIKE, ".mjs": CLIKE, ".cjs": CLIKE, ".jsx": CLIKE,
  ".ts": CLIKE, ".tsx": CLIKE, ".go": CLIKE, ".rs": CLIKE,
  ".java": CLIKE, ".kt": CLIKE, ".swift": CLIKE, ".cs": CLIKE,
  ".c": CLIKE, ".h": CLIKE, ".cc": CLIKE, ".cpp": CLIKE, ".hpp": CLIKE,
  ".php": CLIKE, ".scala": CLIKE, ".dart": CLIKE,
  ".py": PYTHON, ".jl": JULIA, ".rb": RUBY,
};

const languageOf = (filePath) => BY_EXTENSION[path.extname(filePath).toLowerCase()] || null;

const stripLiterals = (line) =>
  line
    .replace(/\\./g, "")
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "")
    .replace(/\/\/.*$/, "");

const indentOf = (line) => line.match(/^[\t ]*/)[0].replace(/\t/g, "    ").length;

const braceEnd = (lines, start) => {
  let depth = 0;
  let opened = false;
  for (let i = start; i < lines.length; i += 1) {
    for (const ch of stripLiterals(lines[i])) {
      if (ch === "{") { depth += 1; opened = true; }
      if (ch === "}") depth -= 1;
    }
    if (opened && depth <= 0) return i;
    if (!opened && i > start) return indentEnd(lines, start);
  }
  return lines.length - 1;
};

const indentEnd = (lines, start) => {
  const base = indentOf(lines[start]);
  let last = start;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    if (indentOf(lines[i]) <= base) break;
    last = i;
  }
  return last;
};

const declarationAt = (language, line) => {
  for (const { kind, re, not } of language.declarations) {
    const found = re.exec(line);
    if (found && !(not && not.test(found[1]))) return { kind, name: found[1] };
  }
  return null;
};

const nestingOf = (symbol, all) =>
  all.filter((other) => other !== symbol && other.start < symbol.start && other.end >= symbol.end).length;

const indentUnitOf = (lines) => {
  const steps = lines.map(indentOf).filter((n) => n > 0);
  return steps.length ? Math.min(8, Math.min(...steps)) : 2;
};

function analyze(language, text) {
  const lines = text.split(/\r?\n/);
  const endOf = language.scope === "braces" ? braceEnd : indentEnd;
  const found = [];
  lines.forEach((line, i) => {
    const declaration = declarationAt(language, line);
    if (!declaration) return;
    found.push({
      name: declaration.name,
      kind: declaration.kind,
      start: i + 1,
      end: endOf(lines, i) + 1,
    });
  });
  const symbols = found.map((symbol) => ({ ...symbol, depth: nestingOf(symbol, found) }));
  return { symbols, indentUnit: indentUnitOf(lines) };
}

const innermost = (symbols, line) =>
  symbols
    .filter((s) => line >= s.start && line <= s.end)
    .reduce((best, s) => (best === null || s.depth > best.depth ? s : best), null);

module.exports = { languageOf, analyze, innermost, indentOf, declarationAt };
