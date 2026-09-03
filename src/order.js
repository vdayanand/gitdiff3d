const { languageOf, declarationAt } = require("./structure");

// What a developer tends to touch first: the shape of the data, then the model,
// then the logic, then whoever calls it, then the tests, then the prose.
const ROLES = [
  [/(^|\/)(tests?|spec|__tests__)\/|[._-](test|spec)\.[A-Za-z]+$/, 4],
  [/\.(md|rst|txt|adoc)$|(^|\/)docs?\//, 5],
  [/(^|\/)(migrations?|schema)\/|\.(sql|prisma|graphql)$/, 0],
  [/(^|\/)(models?|types?|entities|domain)\//, 1],
  [/(^|\/)(api|routes?|handlers?|controllers?|cmd|bin|cli)\//, 3],
];

const roleOf = (path) => {
  for (const [pattern, rank] of ROLES) {
    if (pattern.test(path)) return rank;
  }
  return 2;
};

const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

const addedText = (hunk) => hunk.lines.filter((line) => line.kind === "add").map((line) => line.text);

const definedBy = (hunk, language) => {
  const names = new Set();
  if (!language) return names;
  addedText(hunk).forEach((text) => {
    const declaration = declarationAt(language, text);
    if (declaration) names.add(declaration.name);
  });
  return names;
};

const usedBy = (hunk) => {
  const names = new Set();
  addedText(hunk).forEach((text) => {
    for (const word of text.match(IDENTIFIER) || []) names.add(word);
  });
  return names;
};

// A hunk that introduces a name should be typed before the hunks that call it;
// everything else falls back to role, then file, then the order git gave us.
function storyEdges(nodes) {
  const definer = new Map();
  nodes.forEach((node) => {
    node.defines.forEach((name) => {
      if (!definer.has(name)) definer.set(name, node.at);
    });
  });
  const edges = [];
  nodes.forEach((node) => {
    node.uses.forEach((name) => {
      if (node.defines.has(name)) return; // introduced right here, no dependency
      const from = definer.get(name);
      if (from !== undefined && from !== node.at) edges.push([from, node.at]);
    });
  });
  return edges;
}

const keyOf = (node) => [node.role, node.file, node.at];

const before = (a, b) => {
  const left = keyOf(a);
  const right = keyOf(b);
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
};

// Kahn's algorithm, but always taking the smallest ready node, so the result is
// one specific order rather than any valid one. A cycle releases its smallest
// member instead of deadlocking.
function settle(nodes, edges) {
  const waiting = new Map(nodes.map((node) => [node.at, 0]));
  const after = new Map(nodes.map((node) => [node.at, []]));
  edges.forEach(([from, to]) => {
    after.get(from).push(to);
    waiting.set(to, waiting.get(to) + 1);
  });

  const byId = new Map(nodes.map((node) => [node.at, node]));
  const left = new Set(nodes.map((node) => node.at));
  const out = [];
  while (left.size > 0) {
    const ready = [...left].filter((at) => waiting.get(at) === 0);
    const pool = (ready.length > 0 ? ready : [...left]).map((at) => byId.get(at));
    const next = pool.reduce((best, node) => (before(node, best) < 0 ? node : best));
    out.push(next);
    left.delete(next.at);
    after.get(next.at).forEach((at) => waiting.set(at, waiting.get(at) - 1));
  }
  return out;
}

function storyOrder(scene) {
  const languages = scene.files.map((file) => languageOf(file.path));
  const nodes = scene.hunks.map((hunk, at) => ({
    at,
    hunk,
    file: hunk.file,
    role: roleOf(scene.files[hunk.file].path),
    defines: definedBy(hunk, languages[hunk.file]),
    uses: usedBy(hunk),
  }));
  return settle(nodes, storyEdges(nodes)).map((node) => node.hunk);
}

function orderHunks(scene, mode) {
  const hunks = mode === "story" ? storyOrder(scene) : scene.hunks;
  return {
    ...scene,
    meta: { ...scene.meta, order: mode },
    hunks: hunks.map((hunk, index) => ({ ...hunk, index: index + 1 })),
  };
}

module.exports = { orderHunks, roleOf };
