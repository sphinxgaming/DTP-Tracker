const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const {
  extractHttpUrls,
  normalizeHttpUrl
} = require(path.join(root, "public", "tools", "url-parser.js"));

test("image extractor accepts links copied from common sources", () => {
  assert.deepEqual(extractHttpUrls("example.com"), ["https://example.com/"]);
  assert.deepEqual(extractHttpUrls("www.example.com/gallery"), ["https://www.example.com/gallery"]);
  assert.deepEqual(extractHttpUrls("//cdn.example.com/photo.png"), ["https://cdn.example.com/photo.png"]);
  assert.deepEqual(
    extractHttpUrls("Open [the gallery](https://images.example.org/photo_(final).png), please."),
    ["https://images.example.org/photo_(final).png"]
  );
  assert.deepEqual(
    extractHttpUrls("<https://example.com/a?x=1&amp;y=2>."),
    ["https://example.com/a?x=1&y=2"]
  );
});

test("image extractor preserves pasted URL order and removes duplicates", () => {
  assert.deepEqual(
    extractHttpUrls("First example.com/a, then https://example.org/b and example.com/a#again"),
    ["https://example.com/a", "https://example.org/b"]
  );
});

test("image extractor normalizes relative asset links without allowing unsafe schemes", () => {
  assert.equal(normalizeHttpUrl("../images/hero.png", "https://example.com/gallery/page"), "https://example.com/images/hero.png");
  assert.equal(normalizeHttpUrl("javascript:alert(1)"), "");
  assert.equal(normalizeHttpUrl("file:///c:/secret.png"), "");
  assert.equal(normalizeHttpUrl("https://user:secret@example.com/private"), "");
});

test("integrated image extractor loads the shared parser and sends raw pasted text to the backend", () => {
  const html = fs.readFileSync(path.join(root, "public", "tools", "image-extractor.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "public", "tools", "image-extractor.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "public", "tools", "image-extractor.css"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

  assert.match(html, /image-extractor\.css\?v=20260828-reliable-links/);
  assert.match(html, /url-parser\.js\?v=20260828-reliable-links/);
  assert.match(html, /image-extractor\.js\?v=20260828-reliable-links/);
  assert.match(app, /DtpUrlParser\.extractHttpUrls/);
  assert.match(app, /rawInput: raw/);
  assert.match(server, /toolExtractPastedUrls\(payload\.rawInput/);
  assert.match(server, /toolLookupHost/);
  assert.match(server, /blocked automated access/);
  assert.match(styles, /\.empty-state\[hidden\],[\s\S]*?\.results-grid\[hidden\][\s\S]*?display: none/);
});
