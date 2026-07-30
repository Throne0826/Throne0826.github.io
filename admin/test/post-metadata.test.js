import test from "node:test";
import assert from "node:assert/strict";
import { parsePostMetadata } from "../lib/post-metadata.js";

test("parsePostMetadata reads structured YAML title and date", () => {
  const result = parsePostMetadata("---\ntitle: 'A: B'\ndate: 2026-07-30 10:20:30\n---\nbody", "fallback.md");
  assert.equal(result.title, "A: B");
  assert.match(result.date, /^2026-07-30/);
});

test("parsePostMetadata falls back safely for invalid front matter", () => {
  assert.deepEqual(parsePostMetadata("---\ntitle: [\n---\n", "fallback.md"), { title: "fallback", date: "" });
});
