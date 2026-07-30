import test from "node:test";
import assert from "node:assert/strict";
import { selectDeployRuns } from "../lib/deploy-status.js";

test("selectDeployRuns ignores completed workflows from an older commit", () => {
  const expected = "a".repeat(40);
  const runs = [
    { name: "pages build and deployment", head_branch: "main", head_sha: "p2", created_at: "2026-07-30T10:04:00Z" },
    { name: "Deploy Hexo", head_branch: "source", head_sha: "b".repeat(40), created_at: "2026-07-30T10:03:00Z" },
    { name: "pages build and deployment", head_branch: "main", head_sha: "p1", created_at: "2026-07-30T10:01:00Z" },
    { name: "Deploy Hexo", head_branch: "source", head_sha: expected, created_at: "2026-07-30T10:02:00Z" }
  ];
  const result = selectDeployRuns(runs, expected);
  assert.equal(result.source.head_sha, expected);
  assert.equal(result.pages.head_sha, "p2");
});

test("selectDeployRuns returns no Pages run until the expected source workflow exists", () => {
  const result = selectDeployRuns([
    { name: "pages build and deployment", head_branch: "main", created_at: "2026-07-30T10:04:00Z" }
  ], "c".repeat(40));
  assert.deepEqual(result, { source: null, pages: null });
});
