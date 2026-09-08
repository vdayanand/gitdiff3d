const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ASSETS = {
  "/": { file: "viewer.html", type: "text/html; charset=utf-8" },
  "/vendor/three.min.js": { file: "vendor/three.min.js", type: "text/javascript" },
};

const asset = (spec) => ({
  type: spec.type,
  body: fs.readFileSync(path.join(__dirname, spec.file)),
});

const CONTEXT_CAP = 200;

function respond(url, query, sceneFor) {
  if (url === "/scene.json") {
    // no ?context at all means "whatever the server was started with"; note that
    // Number(null) is 0, which would silently mean zero context lines
    const asked = query.get("context");
    const lines = asked === null ? NaN : Number(asked);
    const context = Number.isFinite(lines) ? Math.min(CONTEXT_CAP, Math.max(0, lines)) : null;
    return { type: "application/json", body: JSON.stringify(sceneFor(context)) };
  }
  const spec = ASSETS[url];
  return spec ? asset(spec) : null;
}

// The scene is this machine's source code. A browser sent here by a name that
// happens to resolve to 127.0.0.1 is not the local user, so only the loopback
// names the local user would type are answered.
const LOOPBACK = /^(?:127\.0\.0\.1|\[::1\]|localhost)(?::\d+)?$/;

function serve(sceneFor, port) {
  const server = http.createServer((req, res) => {
    if (!LOOPBACK.test(req.headers.host || "")) {
      res.writeHead(403).end("not for this host");
      return;
    }
    const at = req.url.indexOf("?");
    const path = at === -1 ? req.url : req.url.slice(0, at);
    const query = new URLSearchParams(at === -1 ? "" : req.url.slice(at + 1));
    const payload = respond(path, query, sceneFor);
    if (!payload) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": payload.type, "cache-control": "no-store" });
    res.end(payload.body);
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () => resolve(server.address().port)),
  );
}

module.exports = { serve };
