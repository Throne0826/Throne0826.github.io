export function selectDeployRuns(runs, expectedSha = "") {
  const source = runs.find((run) => run.name === "Deploy Hexo" && (!expectedSha || run.head_sha === expectedSha));
  if (!source) return { source: null, pages: null };
  const sourceCreatedAt = Date.parse(source.created_at);
  const pages = runs.find((run) => run.name === "pages build and deployment"
    && run.head_branch === "main"
    && Date.parse(run.created_at) >= sourceCreatedAt) || null;
  return { source, pages };
}
