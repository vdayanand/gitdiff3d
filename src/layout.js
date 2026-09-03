const { languageOf, analyze, innermost } = require("./structure");

const MAX_TEXT = 200;

const clip = (text) => text.slice(0, MAX_TEXT);

const countOf = (lines, kind) => lines.filter((line) => line.kind === kind).length;

const structureOf = (file, source) => {
  const language = languageOf(file.path);
  if (!language || !source) return null;
  return { language, ...analyze(language, source) };
};

const isCommentOnly = (structure, lines) =>
  structure !== null &&
  lines
    .filter((line) => line.kind !== "ctx")
    .every((line) => !line.text.trim() || structure.language.comment.test(line.text));

const changeAnchor = (hunk) =>
  hunk.lines.reduce(
    (at, line) =>
      at.found ? at
        : line.kind !== "ctx" ? { found: true, line: at.line }
        : { found: false, line: at.line + 1 },
    { found: false, line: hunk.newStart },
  ).line;

const hunkOf = (structure) => (hunk) => {
  const symbol = structure && innermost(structure.symbols, changeAnchor(hunk));
  return {
    oldStart: hunk.oldStart,
    newStart: hunk.newStart,
    symbol: symbol ? symbol.name : null,
    additions: countOf(hunk.lines, "add"),
    deletions: countOf(hunk.lines, "del"),
    comment: isCommentOnly(structure, hunk.lines),
    lines: hunk.lines.map((line) => ({
      kind: line.kind,
      text: clip(line.text),
      oldNo: line.oldNo,
      newNo: line.newNo,
    })),
  };
};

const fileOf = (file, structure) => ({
  path: file.path,
  status: file.status,
  language: structure ? structure.language.name : null,
  additions: file.additions,
  deletions: file.deletions,
});

function buildScene(diff, meta, sources) {
  const readable = diff.files.filter((file) => !file.binary);
  const analysed = readable.map((file) => {
    const structure = structureOf(file, sources[file.path]);
    return { file: fileOf(file, structure), hunks: file.hunks.map(hunkOf(structure)) };
  });
  const hunks = analysed.flatMap(({ hunks: own }, file) => own.map((hunk) => ({ ...hunk, file })));
  return {
    meta,
    totals: {
      files: analysed.length,
      hunks: hunks.length,
      additions: analysed.reduce((n, { file }) => n + file.additions, 0),
      deletions: analysed.reduce((n, { file }) => n + file.deletions, 0),
    },
    files: analysed.map(({ file }) => file),
    hunks: hunks.map((hunk, index) => ({ ...hunk, index: index + 1 })),
  };
}

module.exports = { buildScene };
