// A removal followed by an addition is usually not a line thrown away and a
// line typed back: it is one line with a few characters moved. This module
// says which removal became which addition, and where the two disagree.

const KEPT_AT_LEAST = 0.5;

const WORD = /[\w$]/;
const isWord = (character) => character !== undefined && WORD.test(character);

const sharedHead = (before, after) => {
  let at = 0;
  while (at < before.length && at < after.length && before[at] === after[at]) at += 1;
  return at;
};

const sharedTail = (before, after, head) => {
  let at = 0;
  while (at < before.length - head && at < after.length - head &&
    before[before.length - 1 - at] === after[after.length - 1 - at]) at += 1;
  return at;
};

// Each line has to stay mostly itself. Summing the two sides instead lets
// shared boilerplate carry an unrelated pairing over the line: "const b =
// two(x)" and "const fresh = brand(x)" share more than half their characters
// between them while neither is an edit of the other.
const stillItself = (kept, whole) => whole === 0 || kept >= whole * KEPT_AT_LEAST;

// The disagreement is one run of characters, grown out to whole words: a span
// that cuts a name in half reads as noise. Where too little survives on either
// side the lines are not versions of each other and there is nothing to point at.
function changedSpan(before, after) {
  const head = sharedHead(before, after);
  const tail = sharedTail(before, after, head);
  let from = head;
  let beforeTo = before.length - tail;
  let afterTo = after.length - tail;

  while (from > 0 && isWord(before[from - 1]) && (isWord(before[from]) || isWord(after[from]))) {
    from -= 1;
  }
  while (beforeTo < before.length && isWord(before[beforeTo]) &&
    (isWord(before[beforeTo - 1]) || isWord(after[afterTo - 1]))) {
    beforeTo += 1;
    afterTo += 1;
  }

  const keptBefore = before.length - (beforeTo - from);
  const keptAfter = after.length - (afterTo - from);
  if (keptBefore === before.length && keptAfter === after.length) return null;
  return stillItself(keptBefore, before.length) && stillItself(keptAfter, after.length)
    ? { before: [from, beforeTo], after: [from, afterTo] }
    : null;
}

const rowFor = (before, after, span) => ({ before, after, span });

const runEnd = (lines, at, kind) => {
  let stop = at;
  while (stop < lines.length && lines[stop].kind === kind) stop += 1;
  return stop;
};

const indices = (from, to) => Array.from({ length: to - from }, (unused, i) => from + i);

// Position alone mispairs the moment a new line is inserted between two edited
// ones, so a line that clearly matches one further down waits for its partner
// and whatever stands in between is read as arriving or leaving on its own.
function pairUp(lines, removed, added) {
  const waitsFor = (text, others) =>
    others.some((at) => changedSpan(text, lines[at].text) !== null);

  const rows = [];
  let d = 0;
  let a = 0;
  while (d < removed.length || a < added.length) {
    if (d >= removed.length) { rows.push(rowFor(null, added[a], null)); a += 1; continue; }
    if (a >= added.length) { rows.push(rowFor(removed[d], null, null)); d += 1; continue; }

    const span = changedSpan(lines[removed[d]].text, lines[added[a]].text);
    if (span !== null) { rows.push(rowFor(removed[d], added[a], span)); d += 1; a += 1; continue; }

    const removalWaits = waitsFor(lines[removed[d]].text, added.slice(a + 1));
    const additionWaits = waitsFor(lines[added[a]].text, removed.slice(d + 1));
    if (removalWaits && !additionWaits) { rows.push(rowFor(null, added[a], null)); a += 1; continue; }
    if (additionWaits && !removalWaits) { rows.push(rowFor(removed[d], null, null)); d += 1; continue; }

    rows.push(rowFor(removed[d], added[a], null));
    d += 1;
    a += 1;
  }
  return rows;
}

// A hunk seen as rows rather than as lines: each row holds the line that was
// there, the line that is there now, or both. An unchanged line is its own
// before and after, so every row has the same shape.
function rowsOf(lines) {
  const rows = [];
  let at = 0;
  while (at < lines.length) {
    const kind = lines[at].kind;
    const stop = runEnd(lines, at, kind);
    if (kind === "ctx") {
      indices(at, stop).forEach((i) => rows.push(rowFor(i, i, null)));
      at = stop;
    } else if (kind === "add") {
      indices(at, stop).forEach((i) => rows.push(rowFor(null, i, null)));
      at = stop;
    } else {
      const end = runEnd(lines, stop, "add");
      pairUp(lines, indices(at, stop), indices(stop, end)).forEach((row) => rows.push(row));
      at = end;
    }
  }
  return rows;
}

module.exports = { changedSpan, rowsOf };
