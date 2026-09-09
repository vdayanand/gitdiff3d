const { languageOf, analyze, innermost } = require("./structure");
const { rowsOf } = require("./replace");

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
  // spans index the text the viewer holds, so they are found on the clipped
  // lines rather than on the originals
  const lines = hunk.lines.map((line) => ({
    kind: line.kind,
    text: clip(line.text),
    oldNo: line.oldNo,
    newNo: line.newNo,
  }));
  return {
    oldStart: hunk.oldStart,
    newStart: hunk.newStart,
    symbol: symbol ? symbol.name : null,
    additions: countOf(hunk.lines, "add"),
    deletions: countOf(hunk.lines, "del"),
    comment: isCommentOnly(structure, hunk.lines),
    lines,
    rows: rowsOf(lines),
  };
};

const fileOf = (file, structure) => ({
  path: file.path,
  status: file.status,
  language: structure ? structure.language.name : null,
  additions: file.additions,
  deletions: file.deletions,
});

// Which files the scene needs, given a hunk budget. Only these get their source
// read, so a branch with thousands of changed files costs a handful of reads.
const withinBudget = (files, maxHunks) => {
  let left = maxHunks > 0 ? maxHunks : Infinity;
  const chosen = [];
  for (const file of files) {
    if (left <= 0) break;
    const take = Math.min(file.hunks.length, left);
    left -= take;
    if (take > 0) chosen.push({ file, take });
  }
  return chosen;
};

const sum = (files, field) => files.reduce((n, file) => n + file[field], 0);

function buildScene(diff, meta, readSource, maxHunks) {
  const readable = diff.files.filter((file) => !file.binary);
  const analysed = withinBudget(readable, maxHunks).map(({ file, take }) => {
    const structure = structureOf(file, readSource(file.path));
    return {
      file: fileOf(file, structure),
      hunks: file.hunks.slice(0, take).map(hunkOf(structure)),
    };
  });
  const hunks = analysed.flatMap(({ hunks: own }, file) => own.map((hunk) => ({ ...hunk, file })));
  return {
    meta,
    totals: {
      files: readable.length,
      hunks: readable.reduce((n, file) => n + file.hunks.length, 0),
      shown: hunks.length,
      additions: sum(readable, "additions"),
      deletions: sum(readable, "deletions"),
    },
    files: analysed.map(({ file }) => file),
    hunks: hunks.map((hunk, index) => ({ ...hunk, index: index + 1 })),
  };
}

module.exports = { buildScene };
