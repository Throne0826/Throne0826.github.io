import test from "node:test";
import assert from "node:assert/strict";
import { cleanSummary, createNewPost, isDocumentVersionCurrent, preserveOuterWhitespace, sortPosts, splitMarkdown, upsertDescription } from "../public/editor-utils.js";

test("splitMarkdown never splits inside a fenced code block", () => {
  const markdown = `intro\n\n\`\`\`cpp\n${"x\n".repeat(20)}\`\`\`\n\nafter\n`;
  const chunks = splitMarkdown(markdown, 20);
  assert.equal(chunks.join(""), markdown);
  assert.equal(chunks.filter((chunk) => chunk.includes("```cpp")).length, 1);
  assert.match(chunks.find((chunk) => chunk.includes("```cpp")), /```cpp[\s\S]*```/);
});

test("cleanSummary removes labels and keeps a complete sentence when shortening", () => {
  const input = `摘要：${"甲".repeat(60)}。${"乙".repeat(60)}。`;
  const summary = cleanSummary(input);
  assert.equal(summary, `${"甲".repeat(60)}。`);
});

test("preserveOuterWhitespace keeps chunk boundaries while accepting trimmed AI output", () => {
  assert.equal(preserveOuterWhitespace("\noriginal\n\n", "changed"), "\nchanged\n\n");
});

test("upsertDescription updates front matter without changing the article body", () => {
  const markdown = "---\ntitle: Test\ndescription: old\ntags:\n  - js\n---\n\n# Body\n";
  const result = upsertDescription(markdown, "new summary");
  assert.match(result, /description: "new summary"/);
  assert.match(result, /tags:\n  - js/);
  assert.match(result, /# Body\n$/);
  assert.doesNotMatch(result, /description: old/);
});

test("createNewPost uses a timestamp to avoid same-day filename collisions", () => {
  const first = createNewPost(new Date(2026, 6, 30, 9, 8, 7));
  const second = createNewPost(new Date(2026, 6, 30, 9, 8, 8));
  assert.equal(first.path, "source/_posts/2026-07-30-090807-新文章.md");
  assert.notEqual(first.path, second.path);
});

test("sortPosts uses front matter dates instead of filenames", () => {
  const posts = [
    { name: "z.md", date: "2025-01-01" },
    { name: "a.md", date: "2026-01-01" }
  ];
  assert.deepEqual(sortPosts(posts, "date-desc").map((post) => post.name), ["a.md", "z.md"]);
  assert.deepEqual(sortPosts(posts, "name-asc").map((post) => post.name), ["a.md", "z.md"]);
});

test("isDocumentVersionCurrent rejects AI results after content or path changes", () => {
  assert.equal(isDocumentVersionCurrent("old", "post.md", "old", "post.md"), true);
  assert.equal(isDocumentVersionCurrent("old", "post.md", "new", "post.md"), false);
  assert.equal(isDocumentVersionCurrent("old", "post.md", "old", "renamed.md"), false);
});
